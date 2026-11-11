import "dotenv/config";
import { registerMobileAuth } from "../auth/mobile-auth";
import { registerApnaVendor } from "../integrations/apna-galla/vendor-http";
import { registerApnaSandbox } from "../integrations/apna-galla/sandbox";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter, verifyIsolatedDevDatabaseUrl } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export function resolveServerListenConfig(
  env: NodeJS.ProcessEnv = process.env
): {
  host: string;
  port: number;
} {
  const devAuthExplicitlyEnabled =
    env.MTM_ENABLE_DEV_AUTH === "1" || env.ALLOW_STANDALONE_DEV_LOGIN === "1";

  const isProhibitedEnv =
    env.NODE_ENV === "production" ||
    env.PUBLIC_PREVIEW === "1" ||
    Boolean(env.VERCEL) ||
    Boolean(env.RENDER) ||
    Boolean(env.RAILWAY_ENVIRONMENT) ||
    Boolean(env.RAILWAY_STATIC_URL) ||
    Boolean(env.FLY_ALLOC_ID) ||
    Boolean(env.HEROKU_APP_NAME) ||
    Boolean(env.K_SERVICE) ||
    Boolean(env.AWS_EXECUTION_ENV) ||
    Boolean(env.DYNO);

  if (devAuthExplicitlyEnabled) {
    if (isProhibitedEnv) {
      throw new Error(
        "Standalone development authentication is strictly forbidden in production, staging, public preview, or cloud-hosted environments. Refusing to start server (fail-closed)."
      );
    }

    if (env.DATABASE_URL) {
      verifyIsolatedDevDatabaseUrl(env.DATABASE_URL);
    }

    const configuredHost = env.HOST?.trim().toLowerCase();
    const allowedLoopbackHosts = ["127.0.0.1", "localhost", "::1", "[::1]"];
    if (configuredHost && !allowedLoopbackHosts.includes(configuredHost)) {
      throw new Error(
        `Standalone development authentication requires loopback binding (127.0.0.1). Prohibited binding to external/wildcard interface '${env.HOST}'. Refusing to start server (fail-closed).`
      );
    }

    const host = configuredHost || "127.0.0.1";
    const port = parsePort(env.PORT || "3000");
    return { host, port };
  }

  const host = env.HOST?.trim() || "0.0.0.0";
  const port = parsePort(env.PORT || "3000");
  return { host, port };
}

function parsePort(rawPort: string): number {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT '${rawPort}'. Must be an integer between 1 and 65535.`
    );
  }
  return port;
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  // Render's edge is the single trusted hop. DNS-only custom domains reach it directly.
  if(process.env.RENDER==="true") app.set("trust proxy",1);
  const server = createServer(app);
  registerMobileAuth(app);
  registerApnaVendor(app);
  registerApnaSandbox(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", async (_req, res) => {
    res.set("Cache-Control","no-store");
    try { const db=await getDb(); if(!db)throw Error("Database unavailable"); await db.execute(sql`SELECT 1`); res.json({status:"ok"}); }
    catch {res.status(503).json({status:"unavailable"});}
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const { host, port } = resolveServerListenConfig(process.env);
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, host, () =>
    console.log(`Server listening on ${host}:${port}`)
  );
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
