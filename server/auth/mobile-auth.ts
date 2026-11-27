import { reserveSmsBudget } from "./sms-budget";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { parse as parseCookies } from "cookie";
import express, { type Express, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import {
  hashCustomerPin,
  validCustomerPin,
  verifyCustomerPin,
} from "./customer-pin";

export class MobileAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new MobileAuthError(status, code, message);
};
const invalid = () =>
  fail(
    400,
    "INVALID_CODE",
    "The code is invalid or expired. Please try again or request a new code."
  );
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const mac = (s: string) =>
  createHmac("sha256", process.env.MTM_OTP_SECRET!).update(s).digest("hex");
const rows = async (db: any, q: any): Promise<any[]> => {
  const r = await db.execute(q);
  return r.rows as any[];
};
const dbRequired = async () => {
  const db = await getDb();
  if (!db)
    fail(
      503,
      "AUTH_UNAVAILABLE",
      "Sign-in is temporarily unavailable. Please try again."
    );
  return db!;
};
const localAddress = (s: string) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].includes(s);
export function normalizeCustomerPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const s = value.trim().replace(/[ ()-]/g, "");
  if (/^[6-9]\d{9}$/.test(s)) return "+91" + s;
  return /^\+91[6-9]\d{9}$/.test(s) ? s : null;
}
export function validateMobileAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.MTM_CUSTOMER_AUTH_ENABLED !== "1") return false;
  if ((env.MTM_OTP_SECRET || "").length < 43)
    throw Error("A dedicated strong MTM_OTP_SECRET is required");
  const origins = (env.MTM_AUTH_ORIGINS || "")
    .split(",")
    .filter(Boolean)
    .map(s => new URL(s.trim()));
  if (
    !origins.length ||
    origins.some(
      u =>
        u.origin !== u.href.replace(/\/$/, "") ||
        u.username ||
        u.password ||
        (u.protocol !== "https:" &&
          !(
            env.NODE_ENV !== "production" &&
            u.protocol === "http:" &&
            localAddress(u.hostname)
          ))
    )
  )
    throw Error("Explicit HTTPS customer sign-in origins are required");
  if (env.MTM_SMS_PROVIDER === "test") {
    const db = new URL(env.DATABASE_URL || "");
    if (
      !["development", "test"].includes(env.NODE_ENV || "") ||
      !localAddress(db.hostname) ||
      !db.pathname.endsWith("_test") ||
      origins.some(u => !localAddress(u.hostname)) ||
      !env.MTM_SMS_TEST_OUTBOX ||
      !isAbsolute(env.MTM_SMS_TEST_OUTBOX)
    )
      throw Error(
        "SMS simulation requires isolated loopback *_test data and a private output path"
      );
  } else if (env.MTM_SMS_PROVIDER !== "apitxt" || !env.APITXT_AUTH_KEY)
    throw Error(
      "Configure the APITXT server key before enabling customer SMS sign-in"
    );
  return true;
}
export function assertMobileOrigin(req: Request) {
  const origin = req.headers.origin;
  const allowed = (process.env.MTM_AUTH_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (
    typeof origin !== "string" ||
    !allowed.includes(origin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    fail(403, "ORIGIN_DENIED", "Open MyTown directly and try again.");
  if (
    process.env.MTM_SMS_PROVIDER === "test" &&
    !localAddress(req.socket?.remoteAddress || "")
  )
    fail(403, "LOCAL_ONLY", "This preview is available only on this computer.");
}
const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-mtm_customer"
    : "mtm_customer_local";
const bindingName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-mtm_login"
    : "mtm_login_local";
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
const cookies = (req: Request) => parseCookies(req.headers.cookie || "");
export function hasMobileSession(req: Request) {
  return typeof cookies(req)[cookieName()] === "string";
}
async function takeLimits(tx: any, phone: string, ip: string, verify = false) {
  const entries = [
    { name: "phone", value: phone, max: verify ? 20 : 5 },
    { name: "ip", value: ip, max: verify ? 60 : 20 },
  ]
    .map(x => ({
      ...x,
      key: mac("limit:" + verify + ":" + x.name + ":" + x.value),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const e of entries) {
    await tx.execute(
      sql`INSERT INTO customer_auth_limits(bucket,hits,resets_at,last_at) VALUES(${e.key},0,((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 HOUR'),'2000-01-01') ON CONFLICT DO NOTHING`
    );
    const [r] = await rows(
      tx,
      sql`SELECT *,resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS expired,EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-last_at)) AS age FROM customer_auth_limits WHERE bucket=${e.key} FOR UPDATE`
    );
    if (
      !r.expired &&
      (r.hits >= e.max || (!verify && e.name === "phone" && r.age < 30))
    )
      return false;
  }
  for (const e of entries)
    await tx.execute(
      sql`UPDATE customer_auth_limits SET hits=CASE WHEN resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE hits+1 END,resets_at=CASE WHEN resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 HOUR') ELSE resets_at END,last_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE bucket=${e.key}`
    );
  return true;
}
export async function sendCustomerOtp(
  phone: string,
  otp: string,
  challengeId: string
) {
  if (process.env.MTM_SMS_PROVIDER === "test") {
    validateMobileAuthConfig();
    let events: any[] = [];
    try {
      events = JSON.parse(
        await readFile(process.env.MTM_SMS_TEST_OUTBOX!, "utf8")
      );
    } catch {}
    await writeFile(
      process.env.MTM_SMS_TEST_OUTBOX!,
      JSON.stringify([
        ...events.slice(-19),
        { phone, otp, challengeId, at: new Date().toISOString() },
      ]),
      { mode: 0o600 }
    );
    return;
  }
  const body = new URLSearchParams({
    authkey: process.env.APITXT_AUTH_KEY!,
    mobile: phone.slice(1),
    otp,
    channel: "sms",
  });
  if (process.env.APITXT_OTP_TEMPLATE_ID)
    body.set("template_id", process.env.APITXT_OTP_TEMPLATE_ID);
  try {
    const r = await fetch("https://apitxt.com/api/sendOTP", {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const result = await r.json();
    if (
      !r.ok ||
      result.status !== "success" ||
      typeof result.data?.request_id !== "string" ||
      !result.data.request_id
    )
      throw Error();
  } catch {
    fail(
      503,
      "SMS_UNAVAILABLE",
      "The verification message could not be requested. Please wait before trying again."
    );
  }
}
export async function beginCustomerLogin(
  req: Request,
  res: Response,
  body: any,
  send = sendCustomerOtp
) {
  const phone = normalizeCustomerPhone(body?.phone);
  if (!phone) fail(400, "INVALID_PHONE", "Enter a valid Indian mobile number.");
  const db = await dbRequired(),
    id = randomUUID(),
    otp = String(randomInt(0, 1000000)).padStart(6, "0");
  const existing = cookies(req)[bindingName()],
    binding =
      typeof existing === "string" && /^[A-Za-z0-9_-]{43}$/.test(existing)
        ? existing
        : randomBytes(32).toString("base64url");
  const accepted = await db.transaction(async tx => {
    if (
      !(await takeLimits(
        tx,
        phone!,
        req.ip || req.socket.remoteAddress || "unknown"
      ))
    )
      return false;
    if (process.env.MTM_SMS_PROVIDER === 'apitxt' && !(await reserveSmsBudget(tx, mac))) return false;
    await tx.execute(
      sql`UPDATE customer_otp_challenges SET state='REVOKED' WHERE phone=${phone} AND state IN('PENDING','READY')`
    );
    await tx.execute(
      sql`INSERT INTO customer_otp_challenges(id,phone,digest,browser_hash,state,expires_at) VALUES(${id},${phone},${mac(id + ":" + phone + ":" + otp)},${digest(binding)},'PENDING',((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '5 MINUTE'))`
    );
    return true;
  });
  if (!accepted)
    fail(
      429,
      "TRY_LATER",
      "Please wait before requesting another code. Too many attempts are temporarily limited."
    );
  try {
    await send(phone!, otp, id);
    await db.execute(
      sql`UPDATE customer_otp_challenges SET state='READY' WHERE id=${id} AND state='PENDING'`
    );
  } catch (e) {
    await db.execute(
      sql`UPDATE customer_otp_challenges SET state='FAILED' WHERE id=${id}`
    );
    if (e instanceof MobileAuthError) throw e;
    fail(
      503,
      "SMS_UNAVAILABLE",
      "The verification message could not be requested. Please try again later."
    );
  }
  res.cookie(bindingName(), binding, {
    ...cookieOptions(),
    maxAge: 10 * 60000,
  });
  return {
    challengeId: id,
    phoneHint: "+91 ••••••" + phone!.slice(-4),
    expiresInSeconds: 300,
    resendAfterSeconds: 30,
  };
}
export async function finishCustomerLogin(
  req: Request,
  res: Response,
  body: any
) {
  if (
    !body ||
    typeof body.challengeId !== "string" ||
    !/^\w{8}-[a-f0-9-]{27}$/i.test(body.challengeId) ||
    typeof body.code !== "string" ||
    !/^\d{6}$/.test(body.code)
  )
    invalid();
  if (body.pin !== undefined && !validCustomerPin(body.pin))
    fail(400, "INVALID_PIN", "Choose a four-digit PIN.");
  const binding = cookies(req)[bindingName()];
  if (typeof binding !== "string") invalid();
  const db = await dbRequired(),
    token = randomBytes(32).toString("base64url"),
    name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const result = await db.transaction(async tx => {
    const [candidate] = await rows(
      tx,
      sql`SELECT phone,browser_hash FROM customer_otp_challenges WHERE id=${body.challengeId}`
    );
    if (!candidate || candidate.browser_hash !== digest(binding!))
      return { error: "invalid" };
    if (
      !(await takeLimits(
        tx,
        candidate.phone,
        req.ip || req.socket.remoteAddress || "unknown",
        true
      ))
    )
      return { error: "limited" };
    const [c] = await rows(
      tx,
      sql`SELECT *,expires_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS expired FROM customer_otp_challenges WHERE id=${body.challengeId} FOR UPDATE`
    );
    if (c.state !== "READY" || c.expired || c.attempts >= 5)
      return { error: c.attempts >= 5 ? "limited" : "invalid" };
    if (
      !timingSafeEqual(
        Buffer.from(c.digest, "hex"),
        Buffer.from(mac(c.id + ":" + c.phone + ":" + body.code), "hex")
      )
    ) {
      await tx.execute(
        sql`UPDATE customer_otp_challenges SET attempts=attempts+1 WHERE id=${c.id}`
      );
      return { error: c.attempts + 1 >= 5 ? "limited" : "invalid" };
    }
    let [identity] = await rows(
      tx,
      sql`SELECT user_id FROM customer_phone_identities WHERE phone=${c.phone} FOR UPDATE`
    );
    if (!identity) {
      const inserted = await tx
        .insert(users)
        .values({
          openId: "mobile_" + randomUUID(),
          name: name || "Customer",
          loginMethod: "phone-otp",
          role: "user",
          lastSignedIn: new Date(),
        })
        .returning({ insertId: users.id });
      identity = { user_id: Number(inserted[0].insertId) };
      await tx.execute(
        sql`INSERT INTO customer_phone_identities(phone,user_id) VALUES(${c.phone},${identity.user_id})`
      );
    }
    const [user] = await rows(
      tx,
      sql`SELECT * FROM users WHERE id=${identity.user_id} FOR UPDATE`
    );
    if (!user || user.role !== "user") return { error: "invalid" };
    if (body.pin !== undefined) {
      const pin = await hashCustomerPin(c.phone, body.pin);
      await tx.execute(
        sql`UPDATE customer_phone_identities SET pin_salt=${pin.salt},pin_digest=${pin.digest},pin_attempts=0,pin_locked_until=NULL WHERE phone=${c.phone}`
      );
      // A fresh OTP is required to replace a PIN. Revoke all older device sessions.
      await tx.execute(
        sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE user_id=${user.id} AND revoked_at IS NULL`
      );
    }
    await tx.execute(
      sql`UPDATE customer_otp_challenges SET state='CONSUMED' WHERE id=${c.id}`
    );
    await tx.execute(
      sql`INSERT INTO customer_mobile_sessions(token_hash,user_id,expires_at) VALUES(${digest(token)},${user.id},((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 DAY'))`
    );
    await tx.execute(
      sql`UPDATE users SET "lastSignedIn"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id=${user.id}`
    );
    const old = await rows(
      tx,
      sql`SELECT token_hash FROM customer_mobile_sessions WHERE user_id=${user.id} AND revoked_at IS NULL ORDER BY created_at DESC,token_hash DESC LIMIT 100`
    );
    for (const session of old
      .filter(s => s.token_hash !== digest(token))
      .slice(4))
      await tx.execute(
        sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash=${session.token_hash}`
      );
    return { userId: user.id };
  });
  if (result.error === "limited")
    fail(
      429,
      "TRY_LATER",
      "Too many attempts. Request a new code after waiting."
    );
  if (result.error) invalid();
  establishCustomerCookie(res, token);
  return { success: true };
}
function establishCustomerCookie(res: Response, token: string) {
  // Remove any previous OAuth/preview browser session before establishing the distinct customer cookie.
  res.clearCookie("webdev_app_session", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.cookie(cookieName(), token, {
    ...cookieOptions(),
    maxAge: 30 * 86400000,
  });
  res.clearCookie(bindingName(), cookieOptions());
  // A normal verified phone sign-in always leaves the separate demo workspace.
  res.clearCookie(
    process.env.NODE_ENV === "production"
      ? "__Host-mtm_review"
      : "mtm_review_local",
    cookieOptions()
  );
}
export async function loginCustomerPin(req: Request, res: Response, body: any) {
  const phone = normalizeCustomerPhone(body?.phone);
  if (!phone || !validCustomerPin(body?.pin))
    fail(
      400,
      "INVALID_REQUEST",
      "Enter your mobile number and four-digit PIN."
    );
  const db = await dbRequired(),
    token = randomBytes(32).toString("base64url");
  const result = await db.transaction(async tx => {
    // Persistent IP and phone buckets cover missing accounts as well as real ones.
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    for (const key of ["ip:" + ip, "phone:" + phone].sort()) {
      const bucket = mac("pin-limit:" + key);
      await tx.execute(
        sql`INSERT INTO customer_auth_limits(bucket,hits,resets_at,last_at) VALUES(${bucket},0,((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 HOUR'),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) ON CONFLICT DO NOTHING`
      );
      const [limit] = await rows(
        tx,
        sql`SELECT *,resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS expired FROM customer_auth_limits WHERE bucket=${bucket} FOR UPDATE`
      );
      if (!limit.expired && limit.hits >= 30) return { error: "limited" };
      await tx.execute(
        sql`UPDATE customer_auth_limits SET hits=CASE WHEN resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE hits+1 END,resets_at=CASE WHEN resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 HOUR') ELSE resets_at END WHERE bucket=${bucket}`
      );
    }
    const [identity] = await rows(
      tx,
      sql`SELECT *,pin_locked_until>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS locked FROM customer_phone_identities WHERE phone=${phone} FOR UPDATE`
    );
    if (identity?.locked) return { error: "limited" };
    const matches = await verifyCustomerPin(
      phone!,
      body.pin,
      identity?.pin_salt,
      identity?.pin_digest
    );
    if (!matches) {
      if (identity) {
        await tx.execute(
          sql`UPDATE customer_phone_identities SET pin_attempts=CASE WHEN pin_locked_until IS NOT NULL AND pin_locked_until<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE pin_attempts+1 END,pin_locked_until=CASE WHEN pin_attempts>=4 AND (pin_locked_until IS NULL OR pin_locked_until>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 MINUTE') ELSE NULL END WHERE phone=${phone}`
        );
        if (!identity.pin_locked_until && identity.pin_attempts >= 4)
          return { error: "limited" };
      }
      return { error: "invalid" };
    }
    const [user] = await rows(
      tx,
      sql`SELECT id FROM users WHERE id=${identity.user_id} AND role='user' FOR UPDATE`
    );
    if (!user) return { error: "invalid" };
    await tx.execute(
      sql`UPDATE customer_phone_identities SET pin_attempts=0,pin_locked_until=NULL WHERE phone=${phone}`
    );
    await tx.execute(
      sql`INSERT INTO customer_mobile_sessions(token_hash,user_id,expires_at) VALUES(${digest(token)},${user.id},((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 DAY'))`
    );
    await tx.execute(
      sql`UPDATE users SET "lastSignedIn"=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id=${user.id}`
    );
    await tx.execute(
      sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash IN (SELECT token_hash FROM customer_mobile_sessions WHERE user_id=${user.id} AND revoked_at IS NULL AND token_hash<>${digest(token)} ORDER BY created_at DESC,token_hash DESC OFFSET 4)`
    );
    return { success: true };
  });
  if (result.error === "limited")
    fail(
      429,
      "TRY_LATER",
      "Too many PIN attempts. Wait 15 minutes or use OTP to reset your PIN."
    );
  if (result.error)
    fail(
      401,
      "INVALID_PIN",
      "Mobile number or PIN is incorrect. New here or forgot your PIN? Verify with OTP."
    );
  establishCustomerCookie(res, token);
  return { success: true };
}

export async function authenticateMobileRequest(req: Request) {
  const token = cookies(req)[cookieName()];
  if (!token) return null;
  if (
    process.env.MTM_CUSTOMER_AUTH_ENABLED !== "1" ||
    !/^[-_A-Za-z0-9]{43}$/.test(token)
  )
    return null;
  const db = await dbRequired();
  const [session] = await rows(
    db,
    sql`SELECT user_id FROM customer_mobile_sessions WHERE token_hash=${digest(token)} AND revoked_at IS NULL AND expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND last_seen_at>((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '7 DAY')`
  );
  if (!session) return null;
  const [user] = await rows(
    db,
    sql`SELECT u.* FROM users u JOIN customer_phone_identities p ON p.user_id=u.id WHERE u.id=${session.user_id} AND u.role='user'`
  );
  if (!user) return null;
  await db.execute(
    sql`UPDATE customer_mobile_sessions SET last_seen_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash=${digest(token)} AND last_seen_at<((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 MINUTE')`
  );
  return user as typeof users.$inferSelect;
}
export async function logoutMobileRequest(req: Request, res: Response) {
  const token = cookies(req)[cookieName()];
  if (!token) return;
  assertMobileOrigin(req);
  const db = await dbRequired();
  await db.execute(
    sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash=${digest(token)}`
  );
  res.clearCookie(cookieName(), cookieOptions());
}
export function registerMobileAuth(app: Express) {
  const enabled = validateMobileAuthConfig(),
    router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/status", (_req, res) =>
    res.json({
      enabled,
      deliveryMode:
        enabled && process.env.MTM_SMS_PROVIDER === "test"
          ? "local-preview"
          : "sms",
    })
  );
  const handle =
    (operation: (req: Request, res: Response, body: any) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        if (!enabled)
          fail(503, "AUTH_DISABLED", "Mobile sign-in is not available yet.");
        assertMobileOrigin(req);
        res.json(await operation(req, res, req.body));
      } catch (e) {
        const error =
          e instanceof MobileAuthError
            ? e
            : new MobileAuthError(
                503,
                "AUTH_UNAVAILABLE",
                "Sign-in is temporarily unavailable. Please try again."
              );
        res
          .status(error.status)
          .json({ code: error.code, message: error.message });
      }
    };
  router.post("/pin", express.json({ limit: "4kb" }), handle(loginCustomerPin));
  router.post(
    "/challenge",
    express.json({ limit: "4kb" }),
    handle(beginCustomerLogin)
  );
  router.post(
    "/verify",
    express.json({ limit: "4kb" }),
    handle(finishCustomerLogin)
  );
  router.use(
    (error: any, _req: Request, res: Response, _next: express.NextFunction) =>
      res.status(error?.status === 413 ? 413 : 400).json({
        code: "INVALID_REQUEST",
        message: "Send a small, valid sign-in request.",
      })
  );
  app.use("/api/auth/mobile", router);
}
