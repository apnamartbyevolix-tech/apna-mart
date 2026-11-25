import express from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, scryptSync } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";
import { parseLocalDatabaseConfig } from "../marketplace/database-config";
import { withReviewDemo } from "./review-demo-context";
import { registerReviewDemo, signReviewToken } from "./review-demo";
import { provisionReviewDemo } from "../review-demo/provision";

const enabled = process.env.MTM_RUN_REVIEW_DB_TESTS === "1";
// No remote database, production account or operator fixture can be used here.
if (enabled) {
  if (process.env.NODE_ENV !== "test")
    throw Error("Review integration tests require NODE_ENV=test");
  parseLocalDatabaseConfig(process.env.DATABASE_URL, "integration");
  parseLocalDatabaseConfig(process.env.MTM_REVIEW_DATABASE_URL, "integration");
}
describe.skipIf(!enabled)("reviewer demo HTTP and database isolation", () => {
  let server: Server, origin: string, cookie: string;
  const password = randomBytes(24).toString("base64url"),
    secret = randomBytes(32).toString("base64url");
  const salt = randomBytes(16);
  const login = (body: unknown, from?: string) =>
    fetch(origin + "/api/auth/review/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: from || origin },
      body: JSON.stringify(body),
    });
  const rpc = (path: string, suppliedCookie = cookie) =>
    fetch(origin + "/api/trpc/" + path, {
      headers: { Cookie: suppliedCookie },
    });
  beforeAll(async () => {
    process.env.MTM_REVIEW_DEMO_ENABLED = "1";
    process.env.MTM_REVIEW_USERNAME = "play-review";
    process.env.MTM_REVIEW_PASSWORD_HASH =
      "scrypt-v1:" +
      salt.toString("hex") +
      ":" +
      scryptSync(password, salt, 64, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      }).toString("hex");
    process.env.MTM_REVIEW_SESSION_SECRET = secret;
    process.env.MTM_REVIEW_PROVISION_CONFIRM = "fictional-review-only-v1";
    process.env.MTM_AUTH_ORIGINS = "http://127.0.0.1:3000";
    await provisionReviewDemo();
    const app = express();
    // Bind first, then configure the exact per-run origin before auth registration.
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
    process.env.MTM_AUTH_ORIGINS = origin;
    registerReviewDemo(app);
    app.use(
      "/api/trpc",
      createExpressMiddleware({ router: appRouter, createContext })
    );
  }, 30000);
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    await withReviewDemo(async () => {
      const db = await getDb();
      await db?.$client.end();
    });
    const db = await getDb();
    await db?.$client.end();
  });
  it("contains fictional demo data only in its separate database", async () => {
    const main = await getDb();
    expect(
      (
        await main!.execute(
          sql`SELECT id FROM users WHERE "openId"='review-demo-v1'`
        )
      ).rows
    ).toHaveLength(0);
    await withReviewDemo(async () => {
      const demo = await getDb();
      expect(demo).not.toBe(main);
      expect(
        (await demo!.execute(sql`SELECT id FROM users WHERE role='admin'`)).rows
      ).toHaveLength(0);
      expect(
        (
          await demo!.execute(
            sql`SELECT id FROM vendor_profiles WHERE "isDemo"=false`
          )
        ).rows
      ).toHaveLength(0);
    });
  });
  it("never exposes passwords or server configuration in status", async () => {
    const response = await fetch(origin + "/api/auth/review/status");
    expect(await response.json()).toEqual({ enabled: true });
  });
  it("rejects cross-origin sign-in before authentication", async () =>
    expect(
      (
        await login(
          { username: "play-review", password },
          "https://attacker.invalid"
        )
      ).status
    ).toBe(403));
  it("rejects incorrect credentials without issuing a session", async () => {
    const response = await login({
      username: "play-review",
      password: "incorrect",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("signs in with a reusable password and an HttpOnly, SameSite cookie", async () => {
    const response = await login({ username: "play-review", password });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, demo: true });
    const header = response.headers
      .getSetCookie()
      .find(value => value.startsWith("mtm_review_local="))!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    cookie = header.split(";")[0];
  });
  it("authenticates only the dedicated customer identity", async () => {
    const response = await rpc("auth.me");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.data.json.role).toBe("user");
    expect(data.result.data.json.loginMethod).toBe("review-demo");
  });
  it("does not fall back to a privileged cookie after token tampering", async () => {
    const response = await rpc(
      "auth.me",
      cookie + "x; webdev_app_session=forged-admin"
    );
    expect(response.status).toBe(401);
  });
  it("rejects signed but unknown sessions", async () =>
    expect(
      (
        await rpc(
          "auth.me",
          "mtm_review_local=" +
            signReviewToken(randomBytes(32).toString("base64url"), secret)
        )
      ).status
    ).toBe(401));
  it("rejects access to administrator, vendor and rider procedures", async () => {
    for (const prefix of ["admin.", "vendor.", "rider."]) {
      const path = Object.keys(appRouter._def.procedures).find(
        path =>
          path.startsWith(prefix) &&
          (appRouter._def.procedures as any)[path]._def.type === "query"
      )!;
      const response = await rpc(path);
      expect(response.status).toBe(403);
    }
  });
  it("leaves the production catalogue guard in place for ordinary requests", async () => {
    const caller = appRouter.createCaller({
      req: {
        headers: { host: "remote.invalid" },
        socket: { remoteAddress: "203.0.113.1" },
      } as any,
      res: {} as any,
      user: null,
    });
    await expect(
      caller.marketplace.home({ townId: 1, zoneId: 1 })
    ).rejects.toThrow();
  });
  it("browses fictional products and places an idempotent pickup order without external integration", async () => {
    const priorMode = process.env.MTM_APNA_CONNECTOR_MODE;
    process.env.MTM_APNA_CONNECTOR_MODE = "production";
    const requests = vi.spyOn(globalThis, "fetch");
    try {
      await withReviewDemo(async () => {
        const db = await getDb();
        const user = (
          await db!.execute(
            sql`SELECT * FROM users WHERE "openId"='review-demo-v1'`
          )
        ).rows[0] as any;
        const caller = appRouter.createCaller({
          req: { headers: {} } as any,
          res: {} as any,
          user,
        });
        const areas = await caller.marketplace.areas();
        const townId = areas.towns[0].id,
          zoneId = areas.zones[0].id;
        const home = await caller.marketplace.home({ townId, zoneId });
        expect(home.products.length).toBeGreaterThan(0);
        const input = {
          townId,
          zoneId,
          shopId: home.shops[0].id,
          fulfillmentType: "pickup" as const,
          paymentMethod: "pickup" as const,
          items: [{ productId: home.products[0].id, quantity: 2 }],
          idempotencyKey: "review-isolated-" + randomBytes(12).toString("hex"),
        };
        const quote = await caller.marketplace.quoteOrder(input);
        const order = await caller.marketplace.placeOrder({
          ...input,
          quoteFingerprint: quote.quoteFingerprint,
        });
        const retry = await caller.marketplace.placeOrder({
          ...input,
          quoteFingerprint: quote.quoteFingerprint,
        });
        expect(retry.orderId).toBe(order.orderId);
        expect(retry.duplicate).toBe(true);
        expect(
          (
            await db!.execute(
              sql`SELECT id FROM orders WHERE id=${order.orderId}`
            )
          ).rows
        ).toHaveLength(1);
        expect(
          (await db!.execute(sql`SELECT * FROM apna_outbox`)).rows
        ).toHaveLength(0);
        expect(requests).not.toHaveBeenCalled();
      });
    } finally {
      requests.mockRestore();
      if (priorMode === undefined) delete process.env.MTM_APNA_CONNECTOR_MODE;
      else process.env.MTM_APNA_CONNECTOR_MODE = priorMode;
    }
  });
  it("revokes the session on logout and accepts the same account on another sign-in", async () => {
    const response = await fetch(origin + "/api/auth/review/logout", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect((await rpc("auth.me")).status).toBe(401);
    expect((await login({ username: "play-review", password })).status).toBe(
      200
    );
  });
});
