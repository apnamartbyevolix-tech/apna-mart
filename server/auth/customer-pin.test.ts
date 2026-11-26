import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomInt, randomUUID, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  hashCustomerPin,
  verifyCustomerPin,
  validCustomerPin,
} from "./customer-pin";
import {
  beginCustomerLogin,
  finishCustomerLogin,
  loginCustomerPin,
  authenticateMobileRequest,
} from "./mobile-auth";

const response = () => {
  const cookies: Record<string, string> = {};
  return {
    cookies,
    cookie: (k: string, v: string) => {
      cookies[k] = v;
    },
    clearCookie: (k: string) => {
      delete cookies[k];
    },
  } as any;
};
const cookie = (r: any) =>
  Object.entries(r.cookies)
    .map(([k, v]) => k + "=" + v)
    .join("; ");
const req = (cookies = "") =>
  ({
    headers: { cookie: cookies, origin: "http://localhost:5206" },
    ip: "pin-test-" + randomUUID(),
    socket: { remoteAddress: "127.0.0.1" },
  }) as any;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
const phones: string[] = [];
const phone = () => {
  const p = "+919" + randomInt(100000000, 1000000000);
  phones.push(p);
  return p;
};
const query = async (q: any) => (await db.execute(q)).rows as any[];
async function otp(p = phone(), pin?: string) {
  const res = response(),
    send = vi.fn(async () => {});
  const start = await beginCustomerLogin(req(), res, { phone: p }, send);
  const code = (send.mock.calls as unknown as string[][])[0][1];
  return {
    p,
    res,
    body: {
      challengeId: start.challengeId,
      code,
      ...(pin === undefined ? {} : { pin }),
    },
  };
}
async function create(pin = "0427") {
  const o = await otp(undefined, pin),
    res = response();
  await finishCustomerLogin(req(cookie(o.res)), res, o.body);
  return { ...o, session: res };
}
beforeAll(async () => {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !u.pathname.endsWith("_test")
  )
    throw Error("Dedicated local *_test only");
  vi.stubEnv("MTM_CUSTOMER_AUTH_ENABLED", "1");
  vi.stubEnv(
    "MTM_OTP_SECRET",
    "private-local-test-pepper-012345678901234567890123456789"
  );
  db = (await getDb())!;
});
afterAll(async () => {
  for (const p of phones) {
    const [i] = await query(
      sql`SELECT user_id FROM customer_phone_identities WHERE phone=${p}`
    );
    if (i) {
      await db.execute(
        sql`DELETE FROM customer_mobile_sessions WHERE user_id=${i.user_id}`
      );
      await db.execute(
        sql`DELETE FROM customer_phone_identities WHERE phone=${p}`
      );
      await db.execute(
        sql`DELETE FROM users WHERE id=${i.user_id} AND "loginMethod"='phone-otp'`
      );
    }
    await db.execute(sql`DELETE FROM customer_otp_challenges WHERE phone=${p}`);
  }
  vi.unstubAllEnvs();
});
describe("customer PIN and OTP recovery", () => {
  it("accepts exactly four numeric characters including a leading zero", () => {
    expect(validCustomerPin("0427")).toBe(true);
    for (const p of [427, "427", "04270", "abcd", null])
      expect(validCustomerPin(p)).toBe(false);
  });
  it("uses random salts and binds hashes to the verified mobile number", async () => {
    const a = await hashCustomerPin("+919000000001", "0427"),
      b = await hashCustomerPin("+919000000001", "0427");
    expect(a.salt).not.toBe(b.salt);
    expect(a.digest).not.toBe("0427");
    expect(
      await verifyCustomerPin("+919000000001", "0427", a.salt, a.digest)
    ).toBe(true);
    expect(
      await verifyCustomerPin("+919000000002", "0427", a.salt, a.digest)
    ).toBe(false);
    expect(
      await verifyCustomerPin("+919000000001", "9999", a.salt, a.digest)
    ).toBe(false);
  });
  it("sets a PIN only after correct OTP then signs in without sending an SMS", async () => {
    const c = await create(),
      out = response();
    await loginCustomerPin(req(), out, { phone: c.p, pin: "0427" });
    const user = await authenticateMobileRequest(req(cookie(out)));
    expect(user?.role).toBe("user");
    const [i] = await query(
      sql`SELECT * FROM customer_phone_identities WHERE phone=${c.p}`
    );
    expect(i.pin_digest).toHaveLength(128);
    expect(i.pin_digest).not.toBe("0427");
    expect(i.pin_salt).toHaveLength(32);
  });
  it("rejects setting a PIN with an incorrect OTP", async () => {
    const o = await otp(undefined, "1234");
    await expect(
      finishCustomerLogin(req(cookie(o.res)), response(), {
        ...o.body,
        code: o.body.code === "000000" ? "111111" : "000000",
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await query(
        sql`SELECT * FROM customer_phone_identities WHERE phone=${o.p}`
      )
    ).toHaveLength(0);
  });
  it("locks after five wrong guesses and rejects even the correct PIN while locked", async () => {
    const c = await create();
    for (let n = 1; n <= 5; n++)
      await expect(
        loginCustomerPin(req(), response(), { phone: c.p, pin: "9999" })
      ).rejects.toMatchObject({ status: n === 5 ? 429 : 401 });
    await expect(
      loginCustomerPin(req(), response(), { phone: c.p, pin: "0427" })
    ).rejects.toMatchObject({ status: 429 });
    const [i] = await query(
      sql`SELECT pin_attempts,pin_locked_until FROM customer_phone_identities WHERE phone=${c.p}`
    );
    expect(i.pin_attempts).toBe(5);
    expect(i.pin_locked_until).not.toBeNull();
  });
  it("allows a correct PIN after the lock expires and resets the failure counter", async () => {
    const c = await create();
    await db.execute(
      sql`UPDATE customer_phone_identities SET pin_attempts=5,pin_locked_until=((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 SECOND') WHERE phone=${c.p}`
    );
    await loginCustomerPin(req(), response(), { phone: c.p, pin: "0427" });
    const [i] = await query(
      sql`SELECT pin_attempts,pin_locked_until FROM customer_phone_identities WHERE phone=${c.p}`
    );
    expect(i.pin_attempts).toBe(0);
    expect(i.pin_locked_until).toBeNull();
  });
  it("OTP reset changes the PIN and revokes old sessions without creating another account", async () => {
    const c = await create();
    const bucket = createHmac("sha256", process.env.MTM_OTP_SECRET!)
      .update("limit:false:phone:" + c.p)
      .digest("hex");
    await db.execute(
      sql`UPDATE customer_auth_limits SET last_at=((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '31 SECOND') WHERE bucket=${bucket}`
    );
    const reset = await otp(c.p, "7631"),
      out = response();
    await finishCustomerLogin(req(cookie(reset.res)), out, reset.body);
    expect(await authenticateMobileRequest(req(cookie(c.session)))).toBeNull();
    expect(await authenticateMobileRequest(req(cookie(out)))).not.toBeNull();
    await expect(
      loginCustomerPin(req(), response(), { phone: c.p, pin: "0427" })
    ).rejects.toMatchObject({ status: 401 });
    await loginCustomerPin(req(), response(), { phone: c.p, pin: "7631" });
    expect(
      await query(
        sql`SELECT * FROM customer_phone_identities WHERE phone=${c.p}`
      )
    ).toHaveLength(1);
    await expect(
      finishCustomerLogin(req(cookie(reset.res)), response(), reset.body)
    ).rejects.toMatchObject({ status: 400 });
  });
  it("keeps existing OTP clients working and requires OTP to set their first PIN", async () => {
    const o = await otp(),
      out = response();
    await finishCustomerLogin(req(cookie(o.res)), out, o.body);
    expect(await authenticateMobileRequest(req(cookie(out)))).not.toBeNull();
    await expect(
      loginCustomerPin(req(), response(), { phone: o.p, pin: "0427" })
    ).rejects.toMatchObject({ status: 401 });
  });
  it("does not disclose whether a phone is registered or promote customer roles", async () => {
    const missing = phone();
    await expect(
      loginCustomerPin(req(), response(), { phone: missing, pin: "0427" })
    ).rejects.toMatchObject({ status: 401, code: "INVALID_PIN" });
    const c = await create(),
      out = response();
    await loginCustomerPin(req(), out, {
      phone: c.p,
      pin: "0427",
      role: "admin",
    });
    expect((await authenticateMobileRequest(req(cookie(out))))?.role).toBe(
      "user"
    );
  });
});
