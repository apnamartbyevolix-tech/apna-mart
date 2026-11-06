import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { getDb } from "../db";
import {
  beginCustomerLogin,
  finishCustomerLogin,
  authenticateMobileRequest,
  logoutMobileRequest,
  normalizeCustomerPhone,
  validateMobileAuthConfig,
  assertMobileOrigin,
} from "./mobile-auth";
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
const phones: string[] = [],
  testIp = "test-" + randomUUID();
const req = (cookie = "", origin = "http://localhost:5206") =>
  ({
    headers: { cookie, origin },
    ip: testIp,
    socket: { remoteAddress: "127.0.0.1" },
  }) as any;
const response = () => {
  const c: Record<string, string> = {};
  return {
    cookies: c,
    cookie: (n: string, v: string) => {
      c[n] = v;
    },
    clearCookie: (n: string) => {
      delete c[n];
    },
  } as any;
};
const cookie = (r: any) =>
  Object.entries(r.cookies)
    .map(([k, v]) => k + "=" + v)
    .join("; ");
const rows = async (q: any): Promise<any[]> => {
  const r = await db.execute(q);
  return r[0] as any[];
};
function phone() {
  const p = "+919" + String(randomInt(100000000, 1000000000));
  phones.push(p);
  return p;
}
async function start(p = phone(), send = vi.fn(async () => {})) {
  const res = response();
  const result = await beginCustomerLogin(req(), res, { phone: p }, send);
  return {
    res,
    result,
    send,
    phone: p,
    code: (send.mock.calls as unknown as string[][])[0]?.[1],
  };
}
const coolDown = async (p: string) => {
  const h = createHmac("sha256", process.env.MTM_OTP_SECRET!)
    .update("limit:false:phone:" + p)
    .digest("hex");
  await db.execute(
    sql`UPDATE customer_auth_limits SET last_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 SECOND) WHERE bucket=${h}`
  );
};
describe("isolated customer mobile authentication", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      !u.pathname.endsWith("_test")
    )
      throw Error("Dedicated localhost *_test required");
    vi.stubEnv("MTM_CUSTOMER_AUTH_ENABLED", "1");
    vi.stubEnv(
      "MTM_OTP_SECRET",
      "separate-unit-test-pepper-never-deployed-0123456789"
    );
    vi.stubEnv("MTM_SMS_PROVIDER", "test");
    vi.stubEnv("MTM_AUTH_ORIGINS", "http://localhost:5206");
    vi.stubEnv(
      "MTM_SMS_TEST_OUTBOX",
      "D:/Codex Output/unused-unit-test-outbox.json"
    );
    db = (await getDb())!;
  });
  afterAll(async () => {
    for (const p of phones) {
      const identities = await rows(
        sql`SELECT user_id FROM customer_phone_identities WHERE phone=${p}`
      );
      for (const i of identities) {
        await db.execute(
          sql`DELETE FROM customer_mobile_sessions WHERE user_id=${i.user_id}`
        );
        await db.execute(
          sql`DELETE FROM customer_phone_identities WHERE user_id=${i.user_id}`
        );
        await db.execute(
          sql`DELETE FROM users WHERE id=${i.user_id} AND loginMethod='phone-otp'`
        );
      }
      await db.execute(
        sql`DELETE FROM customer_otp_challenges WHERE phone=${p}`
      );
    }
    vi.unstubAllEnvs();
  });
  it("normalizes Indian customer numbers without accepting other inputs", () => {
    expect(normalizeCustomerPhone("90000 00001")).toBe("+919000000001");
    expect(normalizeCustomerPhone("+91 90000-00001")).toBe("+919000000001");
    expect(normalizeCustomerPhone("123")).toBeNull();
    expect(normalizeCustomerPhone("+12025550100")).toBeNull();
  });
  it("rejects missing, cross-site and non-allowlisted origins", () => {
    expect(() => assertMobileOrigin(req("", "https://evil.invalid"))).toThrow();
    expect(() => assertMobileOrigin({ ...req(), headers: {} })).toThrow();
    expect(() => assertMobileOrigin(req())).not.toThrow();
  });
  it("forbids SMS simulation in production", () =>
    expect(() =>
      validateMobileAuthConfig({ ...process.env, NODE_ENV: "production" })
    ).toThrow());
  it("stores only a digest and binds verification to the initiating browser", async () => {
    const s = await start();
    const [c] = await rows(
      sql`SELECT * FROM customer_otp_challenges WHERE id=${s.result.challengeId}`
    );
    expect(c.digest === s.code).toBe(false);
    expect(s.result).not.toHaveProperty("otp");
    await expect(
      finishCustomerLogin(req(), response(), {
        challengeId: s.result.challengeId,
        code: s.code,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
  it("keeps failed attempts committed and locks after five guesses", async () => {
    const s = await start(),
      wrong = s.code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 5; i++)
      await expect(
        finishCustomerLogin(req(cookie(s.res)), response(), {
          challengeId: s.result.challengeId,
          code: wrong,
        })
      ).rejects.toMatchObject({ status: i === 5 ? 429 : 400 });
    const [c] = await rows(
      sql`SELECT attempts FROM customer_otp_challenges WHERE id=${s.result.challengeId}`
    );
    expect(c.attempts).toBe(5);
    await expect(
      finishCustomerLogin(req(cookie(s.res)), response(), {
        challengeId: s.result.challengeId,
        code: s.code,
      })
    ).rejects.toMatchObject({ status: 429 });
  });
  it("rejects expired codes and provider-failed challenges", async () => {
    const s = await start();
    await db.execute(
      sql`UPDATE customer_otp_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=${s.result.challengeId}`
    );
    await expect(
      finishCustomerLogin(req(cookie(s.res)), response(), {
        challengeId: s.result.challengeId,
        code: s.code,
      })
    ).rejects.toMatchObject({ status: 400 });
    const send = vi.fn(async () => {
      throw Error("provider rejected");
    });
    await expect(start(phone(), send)).rejects.toMatchObject({ status: 503 });
  });
  it("enforces resend cooldown and invalidates the previous code", async () => {
    const s = await start();
    await expect(start(s.phone)).rejects.toMatchObject({ status: 429 });
    await coolDown(s.phone);
    const next = await start(s.phone);
    await expect(
      finishCustomerLogin(req(cookie(s.res)), response(), {
        challengeId: s.result.challengeId,
        code: s.code,
      })
    ).rejects.toMatchObject({ status: 400 });
    const result = response();
    await finishCustomerLogin(req(cookie(next.res)), result, {
      challengeId: next.result.challengeId,
      code: next.code,
    });
    expect(!!result.cookies.mtm_customer_local).toBe(true);
  });
  it("creates only a customer, ignores supplied roles/email and cannot reuse a consumed OTP", async () => {
    const s = await start(),
      res = response();
    await finishCustomerLogin(req(cookie(s.res)), res, {
      challengeId: s.result.challengeId,
      code: s.code,
      name: "Auth Regression Customer",
      role: "admin",
      email: "admin@example.invalid",
    });
    const user = await authenticateMobileRequest(req(cookie(res)));
    expect(user?.role).toBe("user");
    expect(user?.email).toBeNull();
    expect(user?.loginMethod).toBe("phone-otp");
    await expect(
      finishCustomerLogin(req(cookie(s.res)), response(), {
        challengeId: s.result.challengeId,
        code: s.code,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
  it("creates one session under concurrent verification and revokes it on sign-out", async () => {
    const s = await start(),
      a = response(),
      b = response();
    const results = await Promise.allSettled([
      finishCustomerLogin(req(cookie(s.res)), a, {
        challengeId: s.result.challengeId,
        code: s.code,
      }),
      finishCustomerLogin(req(cookie(s.res)), b, {
        challengeId: s.result.challengeId,
        code: s.code,
      }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const success = a.cookies.mtm_customer_local ? a : b,
      saved = cookie(success);
    expect(!!(await authenticateMobileRequest(req(saved)))).toBe(true);
    await logoutMobileRequest(req(saved), success);
    expect(await authenticateMobileRequest(req(saved))).toBeNull();
  });
  it("retains identity across sign-ins and does not depend on a redeployed JWT signing key", async () => {
    const s = await start(),
      a = response();
    await finishCustomerLogin(req(cookie(s.res)), a, {
      challengeId: s.result.challengeId,
      code: s.code,
    });
    const user = await authenticateMobileRequest(req(cookie(a)));
    await coolDown(s.phone);
    const again = await start(s.phone),
      b = response();
    await finishCustomerLogin(req(cookie(again.res)), b, {
      challengeId: again.result.challengeId,
      code: again.code,
    });
    expect((await authenticateMobileRequest(req(cookie(b))))?.id).toBe(
      user?.id
    );
  });
});
