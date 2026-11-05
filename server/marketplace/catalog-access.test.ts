import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../routers";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn(), upsertUser: vi.fn(), getUserByOpenId: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PUBLIC_PREVIEW", "");
  vi.stubEnv("DATABASE_URL", "mysql://unit:unit@127.0.0.1/mtm_e2e_catalog");
});
afterEach(() => vi.unstubAllEnvs());

function caller(remoteAddress = "127.0.0.1") {
  return appRouter.createCaller({
    req: { headers: { host: "localhost:3000" }, socket: { remoteAddress } },
    res: {},
    user: { id: 1, openId: "test-customer", role: "user" },
  } as unknown as TrpcContext);
}
const routes = ["home", "search", "shop", "product", "quoteOrder", "placeOrder"] as const;
function request(route: typeof routes[number], who = caller()) {
  const scope = { townId: 1, zoneId: 1 };
  switch (route) {
    case "home": return who.marketplace.home(scope);
    case "search": return who.marketplace.search(scope);
    case "shop": return who.marketplace.shop({ ...scope, shopId: 1 });
    case "product": return who.marketplace.product({ ...scope, productId: 1 });
    case "quoteOrder": return who.marketplace.quoteOrder({ ...scope, shopId: 1, fulfillmentType: "pickup", paymentMethod: "pickup", items: [{ productId: 1, quantity: 1 }] });
    case "placeOrder": return who.marketplace.placeOrder({ ...scope, shopId: 1, idempotencyKey: "catalog-test-attempt", fulfillmentType: "pickup", paymentMethod: "pickup", items: [{ productId: 1, quantity: 1 }] });
  }
}

describe("catalogue release boundary without verified ERP eligibility", () => {
  it.each(routes)("blocks production %s before database access", async route => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(request(route)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each(routes)("blocks public-preview %s before database access", async route => {
    vi.stubEnv("PUBLIC_PREVIEW", "1");
    await expect(request(route)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("rejects remote requests even with a forged local Host", async () => {
    await expect(request("home", caller("203.0.113.10"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("rejects non-isolated development databases before access", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://unit:unit@127.0.0.1/shared_shop");
    await expect(request("home")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });
});
