import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertOrderTransition,
  assertServesZone,
  calculateOrderTotals,
  deriveHandoverCode,
  makeOrderLedgerEntries,
  verifyHandoverCode,
} from "./domain";

describe("marketplace domain rules", () => {
  it.each([
    { items: [{ pricePaise: -1, quantity: 1 }] },
    { items: [{ pricePaise: 1.5, quantity: 2 }] },
    { deliveryFeePaise: -1 },
    { platformFeePaise: 0.5 },
    { commissionBps: 10001 },
  ])("rejects invalid authoritative money configuration %o", changed => {
    expect(() => calculateOrderTotals({ items: [{ pricePaise: 100, quantity: 1 }], deliveryFeePaise: 0, platformFeePaise: 0, commissionBps: 500, ...changed })).toThrow(TRPCError);
  });
  it("calculates all price components in integer paise on the server", () => {
    expect(
      calculateOrderTotals({
        items: [
          { pricePaise: 1250, quantity: 2 },
          { pricePaise: 315, quantity: 1 },
        ],
        deliveryFeePaise: 2000,
        platformFeePaise: 100,
        commissionBps: 500,
      })
    ).toEqual({
      subtotalPaise: 2815,
      discountPaise: 0,
      deliveryFeePaise: 2000,
      platformFeePaise: 100,
      taxPaise: 0,
      commissionPaise: 140,
      totalPaise: 4915,
    });
  });
  it("records a configured platform fee as a separate marketplace ledger entry", () => {
    const entries = makeOrderLedgerEntries({
      orderId: 9,
      vendorId: 4,
      subtotalPaise: 2815,
      commissionPaise: 140,
      deliveryFeePaise: 2000,
      platformFeePaise: 100,
    });
    expect(entries).toContainEqual({
      orderId: 9,
      vendorId: null,
      kind: "platform_fee",
      amountPaise: 100,
      status: "pending",
    });
    expect(entries.map(entry => entry.kind)).toEqual([
      "sale",
      "commission",
      "delivery_fee",
      "platform_fee",
    ]);
  });
  it("rejects impossible transitions and permits customer cancellation only before fulfillment", () => {
    expect(() =>
      assertOrderTransition("customer", "placed", "cancelled")
    ).not.toThrow();
    expect(() =>
      assertOrderTransition("customer", "out_for_delivery", "cancelled")
    ).toThrow(TRPCError);
    expect(() =>
      assertOrderTransition("vendor", "placed", "delivered")
    ).toThrow(TRPCError);
  });
  it("supports seller-managed delivery transitions from ready to dispatched and delivered", () => {
    expect(() =>
      assertOrderTransition("vendor", "ready", "out_for_delivery")
    ).not.toThrow();
    expect(() =>
      assertOrderTransition("vendor", "out_for_delivery", "delivered")
    ).not.toThrow();
    expect(() =>
      assertOrderTransition("vendor", "out_for_delivery", "failed_delivery")
    ).not.toThrow();
    expect(() =>
      assertOrderTransition("vendor", "ready", "rejected")
    ).toThrow(TRPCError);
  });
  it("enforces service zone and delivery-enabled constraints", () => {
    expect(() => assertServesZone(10, 10, true)).not.toThrow();
    expect(() => assertServesZone(10, 11, true)).toThrow(TRPCError);
    expect(() => assertServesZone(10, 10, false)).toThrow(TRPCError);
  });
  it("derives an order-bound handover code and rejects invalid or replayed codes", () => {
    const secret = "test-only-signing-key-with-more-than-32-bytes";
    const code = deriveHandoverCode(42, secret);
    expect(code).toMatch(/^\d{8}$/);
    expect(verifyHandoverCode(42, code, secret)).toBe(true);
    expect(verifyHandoverCode(43, code, secret)).toBe(false);
    expect(verifyHandoverCode(42, "123", secret)).toBe(false);
  });
});
