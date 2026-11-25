import { AsyncLocalStorage } from "node:async_hooks";
import {
  databaseConnectionConfig,
  parseLocalDatabaseConfig,
} from "../marketplace/database-config";

// Request-local selection, never a process-wide DATABASE_URL override. A demo
// request cannot fall back to the customer database, including on errors.
const scope = new AsyncLocalStorage<true>();
export const isReviewDemo = () => scope.getStore() === true;
export const withReviewDemo = <T>(operation: () => T): T =>
  scope.run(true, operation);

export function reviewDemoConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.MTM_REVIEW_DEMO_ENABLED !== "1") return null;
  if (
    !/^[a-zA-Z0-9_-]{3,64}$/.test(env.MTM_REVIEW_USERNAME || "") ||
    !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(
      env.MTM_REVIEW_PASSWORD_HASH || ""
    ) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(env.MTM_REVIEW_SESSION_SECRET || "")
  )
    throw Error("Dedicated review credentials are required");
  const raw = env.MTM_REVIEW_DATABASE_URL || "";
  let demo: URL, live: URL;
  try {
    demo = new URL(raw);
    live = new URL(env.DATABASE_URL || "");
  } catch {
    throw Error(
      "Valid separate review and application database URLs are required"
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(demo.hostname);
  if (
    !demo.username ||
    !demo.password ||
    demo.pathname === live.pathname ||
    demo.username === live.username ||
    demo.hash
  )
    throw Error("Review access requires a separate database and database role");
  if (local) {
    if (env.NODE_ENV === "production" || !demo.pathname.endsWith("_test"))
      throw Error("Local reviewer work requires a disposable *_test database");
  } else if (
    env.NODE_ENV !== "production" ||
    demo.pathname !== "/mtm_review_demo"
  ) {
    throw Error(
      "Remote review access requires the dedicated mtm_review_demo database"
    );
  }
  const connection = local
    ? parseLocalDatabaseConfig(raw, "integration")
    : databaseConnectionConfig(raw, { NODE_ENV: "production" });
  const origins = (env.MTM_AUTH_ORIGINS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
  if (
    !origins.length ||
    origins.some(value => {
      let u: URL;
      try {
        u = new URL(value);
      } catch {
        return true;
      }
      return (
        u.origin !== value ||
        (u.protocol !== "https:" &&
          !(
            local &&
            u.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(u.hostname)
          ))
      );
    })
  )
    throw Error("Explicit secure review sign-in origins are required");
  return {
    connection,
    username: env.MTM_REVIEW_USERNAME!,
    passwordHash: env.MTM_REVIEW_PASSWORD_HASH!,
    secret: env.MTM_REVIEW_SESSION_SECRET!,
    origins,
  };
}
