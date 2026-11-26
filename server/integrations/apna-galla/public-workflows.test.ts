import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../../routers";
import { reserveForCheckout } from "./sandbox";
import { getDb } from "../../db";

vi.mock("../../db", () => ({ getDb: vi.fn(), upsertUser: vi.fn(), getUserByOpenId: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("connected public shopping cannot fall back to standalone selling", () => {
  it("rejects checkout for a seller with no ERP mapping", async () => {
    vi.stubEnv("MTM_APNA_CONNECTOR_MODE", "production");
    const db = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(reserveForCheckout(db, { shopId: 123 }, { id: 9 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("keeps the public customer app from operating a legacy seller dashboard", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MTM_APNA_CONNECTOR_MODE", "production");
    const caller = appRouter.createCaller({
      req: { headers: { host: "apna-mart.in" } }, res: {},
      user: { id: 9, openId: "test-customer", role: "user" },
    } as any);
    await expect(caller.vendor.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
