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
describe("historical PIN compatibility and OTP-only access", () => {
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
  it("keeps OTP sign-in working and ignores deprecated PIN setup fields",async()=>{
    const c=await create(),out=response();
    expect((await authenticateMobileRequest(req(cookie(c.session))))?.role).toBe('user');
    await expect(loginCustomerPin(req(),out,{phone:c.p,pin:'0427'})).rejects.toMatchObject({status:409,code:'OTP_REQUIRED'});
    expect(out.cookies).toEqual({});
    const [identity]=await query(sql`SELECT pin_digest,pin_salt FROM customer_phone_identities WHERE phone=${c.p}`);
    expect(identity.pin_digest).toBeNull();expect(identity.pin_salt).toBeNull();
  });
  it("rejects wrong OTP even when a legacy PIN was submitted",async()=>{
    const o=await otp(undefined,'1234');
    await expect(finishCustomerLogin(req(cookie(o.res)),response(),{...o.body,code:o.body.code==='000000'?'111111':'000000'})).rejects.toMatchObject({status:400});
    expect(await query(sql`SELECT * FROM customer_phone_identities WHERE phone=${o.p}`)).toHaveLength(0);
  });
  it("rejects a correct historical PIN as well as wrong guesses",async()=>{
    const c=await create(),historical=await hashCustomerPin(c.p,'0427');
    await db.execute(sql`UPDATE customer_phone_identities SET pin_salt=${historical.salt},pin_digest=${historical.digest} WHERE phone=${c.p}`);
    for(const pin of ['9999','0427','0000','1234','0427'])await expect(loginCustomerPin(req(),response(),{phone:c.p,pin})).rejects.toMatchObject({status:409,code:'OTP_REQUIRED'});
    const [identity]=await query(sql`SELECT pin_attempts,pin_digest FROM customer_phone_identities WHERE phone=${c.p}`);
    expect(identity.pin_attempts).toBe(0);expect(identity.pin_digest).toBe(historical.digest);
  });
  it("does not revive PIN login when a historical lock expires",async()=>{
    const c=await create();
    await db.execute(sql`UPDATE customer_phone_identities SET pin_attempts=5,pin_locked_until=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '1 second' WHERE phone=${c.p}`);
    await expect(loginCustomerPin(req(),response(),{phone:c.p,pin:'0427'})).rejects.toMatchObject({status:409,code:'OTP_REQUIRED'});
    expect(await authenticateMobileRequest(req(cookie(c.session)))).not.toBeNull();
  });
  it("a fresh OTP reuses the account, preserves valid other sessions and remains single use",async()=>{
    const c=await create();
    const bucket=createHmac('sha256',process.env.MTM_OTP_SECRET!).update('limit:false:phone:'+c.p).digest('hex');
    await db.execute(sql`UPDATE customer_auth_limits SET last_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-interval '31 second' WHERE bucket=${bucket}`);
    const next=await otp(c.p,'7631'),out=response();
    await finishCustomerLogin(req(cookie(next.res)),out,next.body);
    const first=await authenticateMobileRequest(req(cookie(c.session))),second=await authenticateMobileRequest(req(cookie(out)));
    expect(first?.id).toBe(second?.id);expect(second).not.toBeNull();
    expect(await query(sql`SELECT * FROM customer_phone_identities WHERE phone=${c.p}`)).toHaveLength(1);
    await expect(finishCustomerLogin(req(cookie(next.res)),response(),next.body)).rejects.toMatchObject({status:400});
  });
  it("retains OTP-only clients without requiring a PIN",async()=>{
    const o=await otp(),out=response();await finishCustomerLogin(req(cookie(o.res)),out,o.body);
    expect(await authenticateMobileRequest(req(cookie(out)))).not.toBeNull();
    await expect(loginCustomerPin(req(),response(),{phone:o.p,pin:'0427'})).rejects.toMatchObject({status:409});
  });
  it("does not disclose registered phones or promote an OTP customer to administrator",async()=>{
    const c=await create();
    for(const p of [phone(),c.p])await expect(loginCustomerPin(req(),response(),{phone:p,pin:'0427',role:'admin'})).rejects.toMatchObject({status:409,code:'OTP_REQUIRED'});
    expect((await authenticateMobileRequest(req(cookie(c.session))))?.role).toBe('user');
  });
});
