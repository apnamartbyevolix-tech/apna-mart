import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { parse } from "cookie";
import express, { type Express, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  isReviewDemo,
  reviewDemoConfig,
  withReviewDemo,
} from "./review-demo-context";

export const reviewCookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-mtm_review"
    : "mtm_review_local";
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const signature = (token: string, secret: string) =>
  createHmac("sha256", secret)
    .update("review-session-v1:" + token)
    .digest("base64url");
export function signReviewToken(token: string, secret: string) {
  return token + "." + signature(token, secret);
}
export function validReviewToken(value: string, secret: string) {
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [token, mac] = value.split(".");
  return equal(mac, signature(token, secret));
}
export const hasReviewCookie = (req: Request) =>
  Object.hasOwn(parse(req.headers.cookie || ""), reviewCookieName());
const requestToken = (req: Request) =>
  parse(req.headers.cookie || "")[reviewCookieName()] || "";
const sessionHash = (token: string) => digest("review-session-v1:" + token);
class ReviewError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
const unavailable = () =>
  new ReviewError(
    503,
    "Demo access is temporarily unavailable. Please try again."
  );
function assertOrigin(req: Request) {
  const config = reviewDemoConfig();
  if (
    !config ||
    typeof req.headers.origin !== "string" ||
    !config.origins.includes(req.headers.origin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    throw new ReviewError(403, "Open Apna Mart directly and try again.");
}
async function requiredDb() {
  if (!isReviewDemo()) throw unavailable();
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}
export async function authenticateReviewRequest(
  req: Request
): Promise<User | null> {
  const config = reviewDemoConfig(),
    token = requestToken(req);
  if (!isReviewDemo() || !config || !validReviewToken(token, config.secret))
    return null;
  const db = await requiredDb();
  const result =
    await db.execute(sql`SELECT u.* FROM users u JOIN customer_mobile_sessions s ON s.user_id=u.id
    WHERE s.token_hash=${sessionHash(token)} AND s.revoked_at IS NULL
    AND s.expires_at>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    AND s.last_seen_at>((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 DAY')
    AND u.role='user' AND u."openId"='review-demo-v1' AND u."loginMethod"='review-demo'`);
  const user = result.rows[0];
  if (!user) return null;
  await db.execute(sql`UPDATE customer_mobile_sessions SET last_seen_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE token_hash=${sessionHash(token)} AND last_seen_at<((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 MINUTE')`);
  return user as User;
}
export async function logoutReviewRequest(req: Request, res: Response) {
  if (!hasReviewCookie(req)) return;
  assertOrigin(req);
  const config = reviewDemoConfig(),
    token = requestToken(req);
  if (config && validReviewToken(token, config.secret))
    await withReviewDemo(async () => {
      const db = await requiredDb();
      await db.execute(
        sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash=${sessionHash(token)}`
      );
    });
  res.clearCookie(reviewCookieName(), cookieOptions());
}
let passwordsInFlight = 0;
export async function verifyReviewPassword(password: string, encoded: string) {
  if (
    !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded) ||
    password.length > 128
  )
    return false;
  if (passwordsInFlight >= 4)
    throw new ReviewError(429, "Please wait before trying again.");
  passwordsInFlight++;
  try {
    const [, salt, expected] = encoded.split(":");
    const actual = await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        Buffer.from(salt, "hex"),
        64,
        { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key))
      )
    );
    return timingSafeEqual(actual, Buffer.from(expected, "hex"));
  } finally {
    passwordsInFlight--;
  }
}
async function takeLoginLimit(req: Request, secret: string) {
  const db = await requiredDb();
  // Persist across restarts. Store keyed fingerprints, never IPs or passwords.
  const bucket = createHmac("sha256", secret)
    .update("review-login:" + (req.ip || req.socket.remoteAddress || "unknown"))
    .digest("hex");
  const result =
    await db.execute(sql`INSERT INTO customer_auth_limits(bucket,hits,resets_at,last_at)
    VALUES(${bucket},1,((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 MINUTE'),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN customer_auth_limits.resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE customer_auth_limits.hits+1 END,
    resets_at=CASE WHEN customer_auth_limits.resets_at<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 MINUTE') ELSE customer_auth_limits.resets_at END,
    last_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') RETURNING hits`);
  if (Number(result.rows[0]?.hits) > 20)
    throw new ReviewError(
      429,
      "Too many sign-in attempts. Wait 15 minutes and try again."
    );
}
export async function beginReviewLogin(
  req: Request,
  res: Response,
  body: unknown
) {
  const config = reviewDemoConfig();
  if (!config) throw unavailable();
  assertOrigin(req);
  const value = body as { username?: unknown; password?: unknown };
  if (
    !value ||
    typeof value.username !== "string" ||
    typeof value.password !== "string" ||
    value.username.length > 64 ||
    !value.password.length ||
    value.password.length > 128
  )
    throw new ReviewError(400, "Enter the demo username and password.");
  return withReviewDemo(async () => {
    await takeLoginLimit(req, config.secret);
    const passwordValid = await verifyReviewPassword(
      value.password as string,
      config.passwordHash
    );
    if (!equal(value.username as string, config.username) || !passwordValid)
      throw new ReviewError(401, "The demo username or password is incorrect.");
    const db = await requiredDb();
    const result = await db.execute(
      sql`SELECT id FROM users WHERE "openId"='review-demo-v1' AND "loginMethod"='review-demo' AND role='user'`
    );
    const user = result.rows[0];
    if (!user) throw unavailable();
    const token = signReviewToken(
      randomBytes(32).toString("base64url"),
      config.secret
    );
    await db.transaction(async tx => {
      await tx.execute(
        sql`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`
      );
      await tx.execute(
        sql`DELETE FROM customer_mobile_sessions WHERE user_id=${user.id} AND expires_at<(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`
      );
      // Allow concurrent reviewers on separate devices without displacing them.
      const sessions = await tx.execute(
        sql`SELECT token_hash FROM customer_mobile_sessions WHERE user_id=${user.id} AND revoked_at IS NULL ORDER BY created_at DESC OFFSET 19`
      );
      for (const row of sessions.rows)
        await tx.execute(
          sql`UPDATE customer_mobile_sessions SET revoked_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE token_hash=${row.token_hash}`
        );
      await tx.execute(sql`INSERT INTO customer_mobile_sessions(token_hash,user_id,created_at,expires_at,last_seen_at)
        VALUES(${sessionHash(token)},${user.id},(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '7 DAY'),(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))`);
    });
    for (const name of [
      "webdev_app_session",
      "__Host-mtm_customer",
      "mtm_customer_local",
    ])
      res.clearCookie(name, {
        ...cookieOptions(),
        secure: name.startsWith("__Host-") || cookieOptions().secure,
      });
    res.cookie(reviewCookieName(), token, {
      ...cookieOptions(),
      maxAge: 7 * 86400000,
    });
    return { success: true, demo: true };
  });
}
function report(error: unknown, res: Response) {
  const known = error instanceof ReviewError ? error : unavailable();
  res
    .set("Cache-Control", "no-store")
    .status(known.status)
    .json({ message: known.message });
}
export function registerReviewDemo(app: Express) {
  const config = reviewDemoConfig(); // Invalid enabled configuration prevents startup.
  app.get("/api/auth/review/status", (_req, res) =>
    res.set("Cache-Control", "no-store").json({ enabled: !!config })
  );
  app.post(
    "/api/auth/review/login",
    express.json({ limit: "2kb" }),
    async (req, res) => {
      try {
        res
          .set("Cache-Control", "no-store")
          .json(await beginReviewLogin(req, res, req.body));
      } catch (error) {
        report(error, res);
      }
    }
  );
  app.post("/api/auth/review/logout", async (req, res) => {
    try {
      await logoutReviewRequest(req, res);
      res.set("Cache-Control", "no-store").json({ success: true });
    } catch (error) {
      report(error, res);
    }
  });
  app.use(
    "/api/auth/review",
    (error: any, _req: Request, res: Response, _next: express.NextFunction) => {
      report(
        new ReviewError(
          error?.status === 413 ? 413 : 400,
          "Send a small, valid demo sign-in request."
        ),
        res
      );
    }
  );
  app.use("/api/trpc", (req, res, next) => {
    if (!hasReviewCookie(req)) return next();
    res.set("Cache-Control", "no-store");
    // A stale/forged demo cookie never falls through to normal or admin auth.
    if (!config || !validReviewToken(requestToken(req), config.secret))
      return report(new ReviewError(401, "Sign in to the demo again."), res);
    return withReviewDemo(async () => {
      try {
        if (req.method !== "GET") assertOrigin(req);
        if (!(await authenticateReviewRequest(req)))
          throw new ReviewError(401, "Sign in to the demo again.");
        next();
      } catch (error) {
        report(error, res);
      }
    });
  });
}
