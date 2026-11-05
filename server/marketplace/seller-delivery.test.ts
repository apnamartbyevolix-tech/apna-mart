import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertNoActiveRiderAssignment,
  assertOrderTransition,
  assertServesZone,
  calculateOrderTotals,
  deriveHandoverCode,
  makeAddressSnapshot,
  makeOrderLedgerEntries,
  verifyHandoverCode,
} from "./domain";
import { validateIntegrationDatabaseUrl } from "./integration-guard";
import { resolveServerListenConfig } from "../_core/index";
import {
  SERVER_TEST_PERSONAS,
  verifyLocalHostRequest,
  verifyIsolatedDevDatabaseUrl,
  executeFailedDeliveryTransition,
  executeReturnRecovery,
} from "../routers";

describe("Seller-managed delivery & fulfillment regression tests", () => {
  const secretKey = "test-secret-key-must-have-at-least-32-characters";

  describe("Fulfillment-type-aware vendor transitions", () => {
    it("permits the complete seller-managed delivery lifecycle", () => {
      // placed -> accepted
      expect(() => assertOrderTransition("vendor", "placed", "accepted", "delivery")).not.toThrow();
      // accepted -> preparing
      expect(() => assertOrderTransition("vendor", "accepted", "preparing", "delivery")).not.toThrow();
      // preparing -> ready
      expect(() => assertOrderTransition("vendor", "preparing", "ready", "delivery")).not.toThrow();
      // ready -> out_for_delivery (seller dispatch)
      expect(() => assertOrderTransition("vendor", "ready", "out_for_delivery", "delivery")).not.toThrow();
      // out_for_delivery -> delivered (handover completed)
      expect(() => assertOrderTransition("vendor", "out_for_delivery", "delivered", "delivery")).not.toThrow();
    });

    it("permits direct pickup fulfillment lifecycle: ready -> delivered", () => {
      expect(() => assertOrderTransition("vendor", "placed", "accepted", "pickup")).not.toThrow();
      expect(() => assertOrderTransition("vendor", "accepted", "preparing", "pickup")).not.toThrow();
      expect(() => assertOrderTransition("vendor", "preparing", "ready", "pickup")).not.toThrow();
      // ready -> delivered (shop counter pickup handover)
      expect(() => assertOrderTransition("vendor", "ready", "delivered", "pickup")).not.toThrow();
    });

    it("rejects pickup orders from transitioning ready -> out_for_delivery", () => {
      expect(() => assertOrderTransition("vendor", "ready", "out_for_delivery", "pickup")).toThrowError(
        /Pickup orders cannot be dispatched out for delivery/
      );
    });

    it("rejects delivery orders from transitioning ready -> delivered without dispatch", () => {
      expect(() => assertOrderTransition("vendor", "ready", "delivered", "delivery")).toThrowError(
        /Delivery orders must be dispatched \(out_for_delivery\) before they can be marked delivered/
      );
    });

    it("permits seller to record failed delivery when customer is unreachable", () => {
      // ready -> out_for_delivery -> failed_delivery
      expect(() => assertOrderTransition("vendor", "ready", "out_for_delivery", "delivery")).not.toThrow();
      expect(() => assertOrderTransition("vendor", "out_for_delivery", "failed_delivery", "delivery")).not.toThrow();
    });

    it("rejects invalid vendor transitions that skip prerequisite fulfillment steps", () => {
      // Cannot deliver directly from placed without prep
      expect(() => assertOrderTransition("vendor", "placed", "delivered", "delivery")).toThrow(TRPCError);
      // Cannot deliver directly from preparing without marking ready
      expect(() => assertOrderTransition("vendor", "preparing", "delivered", "delivery")).toThrow(TRPCError);
      // Cannot dispatch directly from placed
      expect(() => assertOrderTransition("vendor", "placed", "out_for_delivery", "delivery")).toThrow(TRPCError);
      // Cannot reject after order has been packed and marked ready
      expect(() => assertOrderTransition("vendor", "ready", "rejected", "delivery")).toThrow(TRPCError);
      // Cannot reject after dispatch
      expect(() => assertOrderTransition("vendor", "out_for_delivery", "rejected", "delivery")).toThrow(TRPCError);
    });

    it("rejects duplicate delivery requests once an order is already delivered", () => {
      // Once delivered, another delivered or out_for_delivery attempt must throw
      expect(() => assertOrderTransition("vendor", "delivered", "delivered", "delivery")).toThrow(TRPCError);
      expect(() => assertOrderTransition("vendor", "delivered", "out_for_delivery", "delivery")).toThrow(TRPCError);
      expect(() => assertOrderTransition("vendor", "delivered", "failed_delivery", "delivery")).toThrow(TRPCError);
      expect(() => assertOrderTransition("vendor", "delivered", "delivered", "pickup")).toThrow(TRPCError);
      expect(() => assertOrderTransition("rider", "delivered", "delivered")).toThrow(TRPCError);
    });

    it("rejects transitions from failed delivery without audited return", () => {
      expect(() => assertOrderTransition("vendor", "failed_delivery", "delivered", "delivery")).toThrow(TRPCError);
      expect(() => assertOrderTransition("vendor", "failed_delivery", "out_for_delivery", "delivery")).toThrow(TRPCError);
      expect(() => assertOrderTransition("vendor", "failed_delivery", "rejected", "delivery")).toThrow(TRPCError);
    });

    it("enforces customer cancellation boundaries", () => {
      // Customer can cancel while placed or accepted
      expect(() => assertOrderTransition("customer", "placed", "cancelled")).not.toThrow();
      expect(() => assertOrderTransition("customer", "accepted", "cancelled")).not.toThrow();
      // Customer CANNOT cancel once out for delivery or preparing
      expect(() => assertOrderTransition("customer", "preparing", "cancelled")).toThrow(TRPCError);
      expect(() => assertOrderTransition("customer", "out_for_delivery", "cancelled")).toThrow(TRPCError);
      expect(() => assertOrderTransition("customer", "delivered", "cancelled")).toThrow(TRPCError);
    });
  });

  describe("Rider-controlled order protection (vendor authorization boundary)", () => {
    it("rejects vendor dispatch (out_for_delivery) when an active platform rider controls the delivery", () => {
      const activeAssignment = { id: 101, status: "assigned" };
      expect(() => assertNoActiveRiderAssignment(activeAssignment, "out_for_delivery")).toThrow(TRPCError);
      expect(() => assertNoActiveRiderAssignment(activeAssignment, "out_for_delivery")).toThrowError(
        /This order has an active platform rider assignment/
      );
    });

    it("rejects vendor delivery completion (delivered) when an active platform rider controls the delivery", () => {
      for (const status of ["assigned", "accepted", "arrived", "picked_up"]) {
        const activeAssignment = { id: 102, status };
        expect(() => assertNoActiveRiderAssignment(activeAssignment, "delivered")).toThrow(TRPCError);
        expect(() => assertNoActiveRiderAssignment(activeAssignment, "delivered")).toThrowError(
          /Delivery fulfillment, completion, and failure reports must be managed by the assigned rider or platform administrator/
        );
      }
    });

    it("rejects vendor reporting failed delivery (failed_delivery) when an active platform rider controls the delivery", () => {
      for (const status of ["assigned", "accepted", "arrived", "picked_up"]) {
        const activeAssignment = { id: 103, status };
        expect(() => assertNoActiveRiderAssignment(activeAssignment, "failed_delivery")).toThrow(TRPCError);
        expect(() => assertNoActiveRiderAssignment(activeAssignment, "failed_delivery")).toThrowError(
          /Delivery fulfillment, completion, and failure reports must be managed by the assigned rider or platform administrator/
        );
      }
    });

    it("permits vendor fulfillment operations when no active platform rider is assigned (seller-managed)", () => {
      expect(() => assertNoActiveRiderAssignment(null, "out_for_delivery")).not.toThrow();
      expect(() => assertNoActiveRiderAssignment(undefined, "delivered")).not.toThrow();
      expect(() => assertNoActiveRiderAssignment(null, "failed_delivery")).not.toThrow();
    });

    it("permits vendor fulfillment when a previous platform rider assignment was declined or failed", () => {
      expect(() => assertNoActiveRiderAssignment({ id: 104, status: "declined" }, "out_for_delivery")).not.toThrow();
      expect(() => assertNoActiveRiderAssignment({ id: 105, status: "failed" }, "failed_delivery")).not.toThrow();
    });
  });

  describe("Customer handover verification & security", () => {
    it("generates an 8-digit deterministic handover code bound to order ID", () => {
      const code1 = deriveHandoverCode(1001, secretKey);
      const code2 = deriveHandoverCode(1001, secretKey);
      const codeOther = deriveHandoverCode(1002, secretKey);

      expect(code1).toMatch(/^\d{8}$/);
      expect(code1).toBe(code2); // Stable for app reload
      expect(code1).not.toBe(codeOther); // Distinct per order
    });

    it("verifies valid customer handover code", () => {
      const code = deriveHandoverCode(555, secretKey);
      expect(verifyHandoverCode(555, code, secretKey)).toBe(true);
    });

    it("rejects invalid, malformed, or replayed handover codes", () => {
      const validCodeForOrder1 = deriveHandoverCode(1, secretKey);

      // Replaying code from Order 1 on Order 2 must fail
      expect(verifyHandoverCode(2, validCodeForOrder1, secretKey)).toBe(false);

      // Wrong length or non-numeric
      expect(verifyHandoverCode(1, "1234567", secretKey)).toBe(false);
      expect(verifyHandoverCode(1, "123456789", secretKey)).toBe(false);
      expect(verifyHandoverCode(1, "abcdefgh", secretKey)).toBe(false);
      expect(verifyHandoverCode(1, "", secretKey)).toBe(false);

      // Random guess must fail
      expect(verifyHandoverCode(1, "99999999", secretKey)).toBe(false);
    });
  });

  describe("Service zone serviceability validation", () => {
    it("accepts delivery when vendor and customer are in the same active zone", () => {
      expect(() => assertServesZone(100, 100, true)).not.toThrow();
    });

    it("rejects delivery when shop does not enable delivery", () => {
      expect(() => assertServesZone(100, 100, false)).toThrow(TRPCError);
    });

    it("rejects delivery when customer address is in a different zone", () => {
      expect(() => assertServesZone(100, 101, true)).toThrow(TRPCError);
    });
  });

  describe("Financial arithmetic & commission calculation", () => {
    it("correctly computes order totals and commission in integer paise", () => {
      const totals = calculateOrderTotals({
        items: [
          { pricePaise: 4500, quantity: 2 }, // ₹90.00
          { pricePaise: 12000, quantity: 1 }, // ₹120.00
        ],
        deliveryFeePaise: 2500, // ₹25.00
        platformFeePaise: 0,
        commissionBps: 300, // 3% commission
      });

      expect(totals.subtotalPaise).toBe(21000); // ₹210.00
      expect(totals.commissionPaise).toBe(630); // 3% of ₹210.00 = ₹6.30
      expect(totals.deliveryFeePaise).toBe(2500);
      expect(totals.totalPaise).toBe(23500); // ₹235.00
    });

    it("generates correct pending ledger entries for sales and platform commission", () => {
      const entries = makeOrderLedgerEntries({
        orderId: 77,
        vendorId: 12,
        subtotalPaise: 50000,
        commissionPaise: 1500,
        deliveryFeePaise: 3000,
        platformFeePaise: 100,
      });

      expect(entries).toEqual([
        { orderId: 77, vendorId: 12, kind: "sale", amountPaise: 50000, status: "pending" },
        { orderId: 77, vendorId: 12, kind: "commission", amountPaise: 1500, status: "pending" },
        { orderId: 77, vendorId: 12, kind: "delivery_fee", amountPaise: 3000, status: "pending" },
        { orderId: 77, vendorId: null, kind: "platform_fee", amountPaise: 100, status: "pending" },
      ]);
    });
  });

  describe("Address snapshotting integrity", () => {
    it("creates an immutable copy of customer address attributes", () => {
      const original = {
        label: "Home",
        recipientName: "Suresh Patel",
        phone: "+919876543210",
        line1: "Shop 4, Gandhi Chowk",
        line2: null,
        landmark: "Near Bus Stand",
        postalCode: "444001",
        townId: 1,
        zoneId: 5,
      };

      const snapshot = makeAddressSnapshot(original);
      expect(snapshot).toEqual(original);
      expect(snapshot).not.toBe(original);
    });
  });

  describe("Development authentication security & isolation rules", () => {
    it("defines strict server-controlled test personas without client privilege assignment", () => {
      expect(SERVER_TEST_PERSONAS.customer).toEqual({
        openId: "dev-persona-customer-01",
        name: "Aarti Sharma (Dev Customer)",
        email: "dev-customer@mytownmarket.test",
        role: "user",
      });
      expect(SERVER_TEST_PERSONAS.vendor).toEqual({
        openId: "dev-persona-vendor-01",
        name: "Rajesh Kirana (Dev Vendor)",
        email: "dev-vendor@mytownmarket.test",
        role: "user",
      });
      expect(SERVER_TEST_PERSONAS.rider).toEqual({
        openId: "dev-persona-rider-01",
        name: "Vikram Singh (Dev Rider)",
        email: "dev-rider@mytownmarket.test",
        role: "user",
      });
      expect(SERVER_TEST_PERSONAS.admin).toEqual({
        openId: "dev-persona-admin-01",
        name: "Local Dev Administrator",
        email: "dev-admin@mytownmarket.test",
        role: "admin",
      });
    });

    it("verifies that test personas cannot be modified by arbitrary client inputs", () => {
      const personaKeys = Object.keys(SERVER_TEST_PERSONAS);
      expect(personaKeys).toEqual(["customer", "vendor", "rider", "admin"]);
      for (const key of personaKeys as Array<keyof typeof SERVER_TEST_PERSONAS>) {
        expect(SERVER_TEST_PERSONAS[key].openId).toMatch(/^dev-persona-/);
      }
    });

    it("rejects remote clients even if Host header is forged as localhost", () => {
      // Remote socket IP with forged Host: localhost
      const spoofedReq = {
        socket: { remoteAddress: "192.168.1.150" },
        headers: { host: "localhost:3000" },
      };
      expect(() => verifyLocalHostRequest(spoofedReq)).toThrow(TRPCError);
      expect(() => verifyLocalHostRequest(spoofedReq)).toThrowError(
        /Remote network connections are forbidden/
      );
    });

    it("rejects requests arriving through an external proxy via x-forwarded headers", () => {
      // Request forwarded by external proxy
      const proxiedReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: {
          host: "localhost:3000",
          "x-forwarded-for": "203.0.113.195",
        },
      };
      expect(() => verifyLocalHostRequest(proxiedReq)).toThrow(TRPCError);
      expect(() => verifyLocalHostRequest(proxiedReq)).toThrowError(
        /cannot be accessed through a public proxy/
      );

      // External proxy host
      const proxiedHostReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "mytownmarket.com",
        },
      };
      expect(() => verifyLocalHostRequest(proxiedHostReq)).toThrow(TRPCError);
      expect(() => verifyLocalHostRequest(proxiedHostReq)).toThrowError(
        /cannot be exposed through an external proxy host/
      );
    });

    it("accepts strictly genuine local loopback requests", () => {
      const validLoopback = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000" },
      };
      expect(() => verifyLocalHostRequest(validLoopback)).not.toThrow();

      const validIpv6Loopback = {
        socket: { remoteAddress: "::1" },
        headers: { host: "127.0.0.1:3000" },
      };
      expect(() => verifyLocalHostRequest(validIpv6Loopback)).not.toThrow();
    });
  });

  describe("Integration test database connection URL safety", () => {
    it("accepts strictly local database hosts with mtm_e2e_ prefix", () => {
      const local1 = validateIntegrationDatabaseUrl("mysql://user:pass@localhost:3306/mtm_e2e_test");
      expect(local1.valid).toBe(true);
      expect(local1.dbName).toBe("mtm_e2e_test");

      const local2 = validateIntegrationDatabaseUrl("mysql://127.0.0.1:3306/mtm_e2e_demo?charset=utf8mb4");
      expect(local2.valid).toBe(true);
      expect(local2.dbName).toBe("mtm_e2e_demo");

      const local3 = validateIntegrationDatabaseUrl("mariadb://[::1]:3306/mtm_e2e_isolated");
      expect(local3.valid).toBe(true);
      expect(local3.dbName).toBe("mtm_e2e_isolated");
    });

    it("rejects database names not beginning with mtm_e2e_", () => {
      const result = validateIntegrationDatabaseUrl("mysql://user:pass@localhost:3306/mytownmarket");
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/must start with 'mtm_e2e_' prefix/);
    });

    it("rejects remote or non-local database hosts", () => {
      const remote = validateIntegrationDatabaseUrl("mysql://user:pass@aws.rds.amazonaws.com:3306/mtm_e2e_db");
      expect(remote.valid).toBe(false);
      expect(remote.reason).toMatch(/not permitted for destructive integration tests/);
    });

    it("rejects substring exploit attempts where mtm_e2e_ is in password or query param", () => {
      // Substring exploit attempt: host is remote, password contains mtm_e2e_
      const exploit1 = validateIntegrationDatabaseUrl("mysql://user:mtm_e2e_pw@remote-prod.com:3306/production_db");
      expect(exploit1.valid).toBe(false);

      // Substring exploit attempt: local host, but real db is prod and mtm_e2e_ is only in query string
      const exploit2 = validateIntegrationDatabaseUrl("mysql://user:pass@localhost:3306/prod_db?comment=mtm_e2e_");
      expect(exploit2.valid).toBe(false);
      expect(exploit2.reason).toMatch(/must start with 'mtm_e2e_' prefix/);
    });

    it("fails closed on missing, malformed, or invalid protocols", () => {
      expect(validateIntegrationDatabaseUrl("").valid).toBe(false);
      expect(validateIntegrationDatabaseUrl(undefined).valid).toBe(false);
      expect(validateIntegrationDatabaseUrl("not-a-url").valid).toBe(false);
      expect(validateIntegrationDatabaseUrl("postgres://localhost:5432/mtm_e2e_db").valid).toBe(false);
    });
  });

  describe("Unified failed-delivery financial handling across actors", () => {
    function createMockTx(options?: {
      payment?: any;
      orderItems?: any[];
    }) {
      const state = {
        payment: options?.payment !== undefined ? options.payment : { id: 1, orderId: 100, status: "pending", recordedAt: null },
        orderUpdated: null as any,
        paymentUpdated: null as any,
        ledgerUpdated: null as any,
        assignmentUpdated: null as any,
        productsUpdated: [] as any[],
        orderItemsUpdated: [] as any[],
        orderEventsInserted: [] as any[],
        auditRecordsInserted: [] as any[],
        lines: options?.orderItems ?? [],
      };

      const tx: any = {
        select: () => ({
          from: () => ({
            where: () => {
              const res: any = Promise.resolve(state.lines);
              res.for = () => ({
                limit: () => Promise.resolve([state.payment].filter(Boolean)),
              });
              return res;
            },
          }),
        }),
        update: () => ({
          set: (values: any) => ({
            where: () => {
              if (values.status === "voided" || values.reference) {
                state.paymentUpdated = values;
              } else if (
                values.paymentStatus === "voided" ||
                values.returnReceivedAt ||
                values.status === "failed_delivery"
              ) {
                state.orderUpdated = { ...(state.orderUpdated ?? {}), ...values };
              } else if (values.status === "reversed") {
                state.ledgerUpdated = values;
              } else if (values.status === "failed") {
                state.assignmentUpdated = values;
              } else if ("restockedQuantity" in values) {
                state.orderItemsUpdated.push(values);
              } else if (values.stockQuantity) {
                state.productsUpdated.push(values);
              }
              return Promise.resolve();
            },
          }),
        }),
        insert: () => ({
          values: (val: any) => {
            if ("orderId" in val && "actorRole" in val && "note" in val) {
              state.orderEventsInserted.push(val);
            } else if ("entityId" in val || "action" in val) {
              state.auditRecordsInserted.push(val);
            }
            return Promise.resolve([{ insertId: 1 }]);
          },
        }),
      };

      return { tx, state };
    }

    const baseOrder: any = {
      id: 100,
      orderNumber: "ORD-100-TEST",
      status: "out_for_delivery",
      paymentStatus: "pending",
      fulfillmentType: "delivery",
      paymentMethod: "cod",
      vendorId: 5,
      customerId: 10,
      returnReceivedAt: null,
      returnCondition: null,
      returnNotes: null,
      stockRestoredAt: null,
    };

    it("voids outstanding payment, reverses pending ledger, and preserves inventory on failed delivery by vendor", async () => {
      const { tx, state } = createMockTx();
      const result = await executeFailedDeliveryTransition(tx, {
        order: { ...baseOrder },
        actorUserId: 12,
        actorRole: "vendor",
        reason: "Customer phone unreachable after 3 attempts",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("failed_delivery");
      expect(state.paymentUpdated.status).toBe("voided");
      expect(state.orderUpdated.status).toBe("failed_delivery");
      expect(state.orderUpdated.paymentStatus).toBe("voided");
      expect(state.orderUpdated.cancelReason).toBe("Customer phone unreachable after 3 attempts");
      expect(state.ledgerUpdated.status).toBe("reversed");
      expect(state.assignmentUpdated.status).toBe("failed");
      // Inventory must remain untouched (preserved in transit until returned to shop)
      expect(state.productsUpdated.length).toBe(0);
      expect(state.orderUpdated.stockRestoredAt).toBeUndefined();
      // Timeline and audit recorded
      expect(state.orderEventsInserted.length).toBe(1);
      expect(state.orderEventsInserted[0].metadata.inventoryPreserved).toBe(true);
      expect(state.auditRecordsInserted.length).toBe(1);
      expect(state.auditRecordsInserted[0].action).toBe("order.delivery_failed");
    });

    it("voids outstanding payment and marks assignment failed on failed delivery by rider", async () => {
      const { tx, state } = createMockTx();
      const result = await executeFailedDeliveryTransition(tx, {
        order: { ...baseOrder },
        actorUserId: 88,
        actorRole: "rider",
        reason: "Customer refused delivery at doorstep",
        assignmentId: 44,
      });

      expect(result.success).toBe(true);
      expect(state.paymentUpdated.status).toBe("voided");
      expect(state.orderUpdated.status).toBe("failed_delivery");
      expect(state.assignmentUpdated.status).toBe("failed");
      expect(state.assignmentUpdated.deliveryProof).toBe("Customer refused delivery at doorstep");
      expect(state.productsUpdated.length).toBe(0);
    });

    it("voids outstanding payment and reverses ledger on failed delivery by admin", async () => {
      const { tx, state } = createMockTx();
      const result = await executeFailedDeliveryTransition(tx, {
        order: { ...baseOrder },
        actorUserId: 1,
        actorRole: "admin",
        reason: "Admin intervened due to transit incident",
      });

      expect(result.success).toBe(true);
      expect(state.paymentUpdated.status).toBe("voided");
      expect(state.ledgerUpdated.status).toBe("reversed");
      expect(state.orderUpdated.status).toBe("failed_delivery");
      expect(state.productsUpdated.length).toBe(0);
    });

    it("prohibits silent voiding if cash was already recorded as collected", async () => {
      const { tx } = createMockTx({
        payment: { id: 1, orderId: 100, status: "collected", recordedAt: new Date() },
      });

      await expect(
        executeFailedDeliveryTransition(tx, {
          order: { ...baseOrder, paymentStatus: "collected" },
          actorUserId: 12,
          actorRole: "vendor",
          reason: "Attempting void after payment collection",
        })
      ).rejects.toThrowError(/Cash is recorded as collected; an authorized refund workflow is required/);
    });

    it("prohibits silent voiding if cash collection was recorded by rider or vendor", async () => {
      const { tx } = createMockTx({
        payment: { id: 1, orderId: 100, status: "pending", recordedAt: new Date() },
      });

      await expect(
        executeFailedDeliveryTransition(tx, {
          order: { ...baseOrder },
          actorUserId: 12,
          actorRole: "vendor",
          reason: "Attempting void after cash recorded",
        })
      ).rejects.toThrowError(/A cash amount has been recorded; admin reconciliation is required/);
    });

    it("rejects failed delivery transition if failure reason is missing or whitespace", async () => {
      const { tx } = createMockTx();
      await expect(
        executeFailedDeliveryTransition(tx, {
          order: { ...baseOrder },
          actorUserId: 12,
          actorRole: "vendor",
          reason: "   ",
        })
      ).rejects.toThrowError(/A failure reason is required/);
    });
  });

  describe("Quantity-accurate return recovery (executeReturnRecovery)", () => {
    function createRecoveryMockTx(options: {
      orderItems: any[];
    }) {
      const state = {
        orderUpdated: null as any,
        productsUpdated: [] as any[],
        orderItemsUpdated: [] as any[],
        orderEventsInserted: [] as any[],
        auditRecordsInserted: [] as any[],
        lines: options.orderItems,
      };

      const tx: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve(state.lines),
          }),
        }),
        update: () => ({
          set: (values: any) => ({
            where: () => {
              if (values.returnReceivedAt || values.returnCondition) {
                state.orderUpdated = values;
              } else if ("restockedQuantity" in values) {
                state.orderItemsUpdated.push(values);
              } else if (values.stockQuantity) {
                state.productsUpdated.push(values);
              }
              return Promise.resolve();
            },
          }),
        }),
        insert: () => ({
          values: (val: any) => {
            if ("orderId" in val && "actorRole" in val && "note" in val) {
              state.orderEventsInserted.push(val);
            } else if ("entityId" in val || "action" in val) {
              state.auditRecordsInserted.push(val);
            }
            return Promise.resolve([{ insertId: 1 }]);
          },
        }),
      };

      return { tx, state };
    }

    const failedOrder: any = {
      id: 200,
      status: "failed_delivery",
      returnReceivedAt: null,
      returnCondition: null,
      returnNotes: null,
      stockRestoredAt: null,
    };

    it("accurately handles 3 units ordered: 2 restocked into stock and 1 recorded as damaged", async () => {
      const orderItems = [
        {
          id: 501,
          orderId: 200,
          productId: 42,
          productNameSnapshot: "Fresh Alphonso Mangoes (1kg)",
          quantity: 3,
          pricePaise: 25000,
          restockedQuantity: 0,
          damagedQuantity: 0,
        },
      ];

      const { tx, state } = createRecoveryMockTx({ orderItems });

      const result = await executeReturnRecovery(tx, {
        order: { ...failedOrder },
        actorUserId: 15,
        actorRole: "vendor",
        inspectionNotes: "2 boxes intact and crisp; 1 box crushed in transit.",
        items: [
          {
            orderItemId: 501,
            restockedQuantity: 2,
            damagedQuantity: 1,
            dispositionNotes: "1 box crushed",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.condition).toBe("partial_loss");
      expect(result.totalRestocked).toBe(2);
      expect(result.totalDamaged).toBe(1);

      // Verify product stock incremented only for restocked units (2 units)
      expect(state.productsUpdated.length).toBe(1);

      // Verify order_items record updated with quantities
      expect(state.orderItemsUpdated.length).toBe(1);
      expect(state.orderItemsUpdated[0]).toEqual({
        restockedQuantity: 2,
        damagedQuantity: 1,
        missingQuantity: 0,
      });

      // Verify order record updated
      expect(state.orderUpdated.returnCondition).toBe("partial_loss");
      expect(state.orderUpdated.returnNotes).toBe("2 boxes intact and crisp; 1 box crushed in transit.");
      expect(state.orderUpdated.returnReceivedAt).toBeInstanceOf(Date);
      expect(state.orderUpdated.stockRestoredAt).toBeInstanceOf(Date);

      // Verify timeline event with item breakdown
      expect(state.orderEventsInserted.length).toBe(1);
      expect(state.orderEventsInserted[0].metadata.totalRestocked).toBe(2);
      expect(state.orderEventsInserted[0].metadata.totalDamaged).toBe(1);
      expect(state.orderEventsInserted[0].metadata.totalMissing).toBe(0);
      expect(state.orderEventsInserted[0].metadata.items[0]).toEqual({
        orderItemId: 501,
        productName: "Fresh Alphonso Mangoes (1kg)",
        ordered: 3,
        restocked: 2,
        damaged: 1,
        missing: 0,
        notes: "1 box crushed",
      });

      // Verify audit record
      expect(state.auditRecordsInserted.length).toBe(1);
      expect(state.auditRecordsInserted[0].action).toBe("order.return_recovered");
      expect(state.auditRecordsInserted[0].details.condition).toBe("partial_loss");
    });

    it("handles 100% restocked parcel condition across multiple lines", async () => {
      const orderItems = [
        { id: 10, orderId: 200, productId: 1, productNameSnapshot: "Atta 5kg", quantity: 2 },
        { id: 11, orderId: 200, productId: 2, productNameSnapshot: "Sugar 1kg", quantity: 1 },
      ];
      const { tx, state } = createRecoveryMockTx({ orderItems });

      const result = await executeReturnRecovery(tx, {
        order: { ...failedOrder },
        actorUserId: 1,
        actorRole: "admin",
        inspectionNotes: "All items sealed and in perfect condition.",
        items: [
          { orderItemId: 10, restockedQuantity: 2, damagedQuantity: 0 },
          { orderItemId: 11, restockedQuantity: 1, damagedQuantity: 0 },
        ],
      });

      expect(result.condition).toBe("restocked");
      expect(result.totalRestocked).toBe(3);
      expect(result.totalDamaged).toBe(0);
      expect(state.productsUpdated.length).toBe(2);
      expect(state.orderUpdated.stockRestoredAt).toBeInstanceOf(Date);
    });

    it("handles 100% damaged shrinkage without restoring product stock", async () => {
      const orderItems = [
        { id: 20, orderId: 200, productId: 5, productNameSnapshot: "Glassware Set", quantity: 2 },
      ];
      const { tx, state } = createRecoveryMockTx({ orderItems });

      const result = await executeReturnRecovery(tx, {
        order: { ...failedOrder },
        actorUserId: 15,
        actorRole: "vendor",
        inspectionNotes: "Entire parcel shattered during transit. Written off as shrinkage.",
        items: [
          { orderItemId: 20, restockedQuantity: 0, damagedQuantity: 2, dispositionNotes: "Shattered" },
        ],
      });

      expect(result.condition).toBe("damaged_shrinkage");
      expect(result.totalRestocked).toBe(0);
      expect(result.totalDamaged).toBe(2);
      expect(state.productsUpdated.length).toBe(0);
      expect(state.orderUpdated.stockRestoredAt).toBeNull();
    });

    it("rejects return recovery if order status is not failed_delivery", async () => {
      const { tx } = createRecoveryMockTx({ orderItems: [] });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder, status: "out_for_delivery" },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Invalid status test",
          items: [],
        })
      ).rejects.toThrowError(/Return recovery can only be performed on orders with status 'failed_delivery'/);
    });

    it("rejects duplicate recovery attempts once returnReceivedAt is set", async () => {
      const { tx } = createRecoveryMockTx({ orderItems: [] });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder, returnReceivedAt: new Date() },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Duplicate recovery attempt",
          items: [],
        })
      ).rejects.toThrowError(/Parcel return has already been recorded and processed for this order/);
    });

    it("rejects negative recovery quantities", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Item", quantity: 2 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Negative quantity test",
          items: [{ orderItemId: 30, restockedQuantity: -1, damagedQuantity: 3 }],
        })
      ).rejects.toThrowError(/must be nonnegative integers/);
    });

    it("rejects non-integer fractional recovery quantities", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Item", quantity: 2 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Fractional test",
          items: [{ orderItemId: 30, restockedQuantity: 1.5, damagedQuantity: 0.5 }],
        })
      ).rejects.toThrowError(/must be nonnegative integers/);
    });

    it("accurately handles 4 units ordered: 2 restocked, 1 damaged, and 1 missing", async () => {
      const orderItems = [
        {
          id: 601,
          orderId: 200,
          productId: 50,
          productNameSnapshot: "Cotton T-Shirt (L)",
          quantity: 4,
          pricePaise: 49900,
          restockedQuantity: 0,
          damagedQuantity: 0,
          missingQuantity: 0,
        },
      ];

      const { tx, state } = createRecoveryMockTx({ orderItems });

      const result = await executeReturnRecovery(tx, {
        order: { ...failedOrder },
        actorUserId: 15,
        actorRole: "vendor",
        inspectionNotes: "2 shirts intact; 1 shirt torn; 1 shirt missing from package.",
        items: [
          {
            orderItemId: 601,
            restockedQuantity: 2,
            damagedQuantity: 1,
            missingQuantity: 1,
            dispositionNotes: "1 torn, 1 missing",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.condition).toBe("partial_loss");
      expect(result.totalRestocked).toBe(2);
      expect(result.totalDamaged).toBe(1);
      expect(result.totalMissing).toBe(1);

      // Verify product stock incremented ONLY for restocked units (2 units)
      expect(state.productsUpdated.length).toBe(1);

      // Verify order_items record updated with quantities
      expect(state.orderItemsUpdated.length).toBe(1);
      expect(state.orderItemsUpdated[0]).toEqual({
        restockedQuantity: 2,
        damagedQuantity: 1,
        missingQuantity: 1,
      });

      // Verify order record updated
      expect(state.orderUpdated.returnCondition).toBe("partial_loss");
      expect(state.orderUpdated.returnReceivedAt).toBeInstanceOf(Date);
      expect(state.orderUpdated.stockRestoredAt).toBeInstanceOf(Date);

      // Verify timeline event with item breakdown including missing quantity
      expect(state.orderEventsInserted.length).toBe(1);
      expect(state.orderEventsInserted[0].metadata.totalRestocked).toBe(2);
      expect(state.orderEventsInserted[0].metadata.totalDamaged).toBe(1);
      expect(state.orderEventsInserted[0].metadata.totalMissing).toBe(1);
      expect(state.orderEventsInserted[0].metadata.items[0]).toEqual({
        orderItemId: 601,
        productName: "Cotton T-Shirt (L)",
        ordered: 4,
        restocked: 2,
        damaged: 1,
        missing: 1,
        notes: "1 torn, 1 missing",
      });

      // Verify audit record
      expect(state.auditRecordsInserted.length).toBe(1);
      expect(state.auditRecordsInserted[0].action).toBe("order.return_recovered");
      expect(state.auditRecordsInserted[0].details.totalMissing).toBe(1);
    });

    it("accurately handles 100% missing items (total_missing)", async () => {
      const orderItems = [
        {
          id: 602,
          orderId: 200,
          productId: 51,
          productNameSnapshot: "Leather Wallet",
          quantity: 3,
          pricePaise: 79900,
          restockedQuantity: 0,
          damagedQuantity: 0,
          missingQuantity: 0,
        },
      ];

      const { tx, state } = createRecoveryMockTx({ orderItems });

      const result = await executeReturnRecovery(tx, {
        order: { ...failedOrder },
        actorUserId: 1,
        actorRole: "admin",
        inspectionNotes: "Parcel returned completely empty. All items lost in transit.",
        items: [
          {
            orderItemId: 602,
            restockedQuantity: 0,
            damagedQuantity: 0,
            missingQuantity: 3,
            dispositionNotes: "All 3 missing",
          },
        ],
      });

      expect(result.condition).toBe("total_missing");
      expect(result.totalRestocked).toBe(0);
      expect(result.totalDamaged).toBe(0);
      expect(result.totalMissing).toBe(3);

      // Product stock must NOT be restored
      expect(state.productsUpdated.length).toBe(0);
      expect(state.orderUpdated.stockRestoredAt).toBeNull();
    });

    it("rejects negative missingQuantity", async () => {
      const orderItems = [
        { id: 40, orderId: 200, productId: 1, productNameSnapshot: "Item", quantity: 3 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Negative missing test",
          items: [{ orderItemId: 40, restockedQuantity: 3, damagedQuantity: 1, missingQuantity: -1 }],
        })
      ).rejects.toThrowError(/must be nonnegative integers/);
    });

    it("rejects non-integer fractional missingQuantity", async () => {
      const orderItems = [
        { id: 40, orderId: 200, productId: 1, productNameSnapshot: "Item", quantity: 3 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Fractional missing test",
          items: [{ orderItemId: 40, restockedQuantity: 2, damagedQuantity: 0, missingQuantity: 1.5 }],
        })
      ).rejects.toThrowError(/must be nonnegative integers/);
    });

    it("rejects quantities when restocked + damaged + missing does not equal ordered quantity", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Atta", quantity: 3 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Mismatch test",
          items: [{ orderItemId: 30, restockedQuantity: 2, damagedQuantity: 0, missingQuantity: 0 }],
        })
      ).rejects.toThrowError(/restockedQuantity \+ damagedQuantity \+ missingQuantity === orderedQuantity/);
    });

    it("rejects duplicate order item IDs in the recovery payload", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Atta", quantity: 2 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Duplicate orderItemId test",
          items: [
            { orderItemId: 30, restockedQuantity: 1, damagedQuantity: 1 },
            { orderItemId: 30, restockedQuantity: 1, damagedQuantity: 1 },
          ],
        })
      ).rejects.toThrowError(/Duplicate recovery entry for order item 30/);
    });

    it("rejects unknown order item IDs not belonging to the order", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Atta", quantity: 2 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Unknown orderItemId test",
          items: [{ orderItemId: 999, restockedQuantity: 1, damagedQuantity: 1 }],
        })
      ).rejects.toThrowError(/Order item 999 does not belong to order 200/);
    });

    it("rejects incomplete item lists that omit an order item", async () => {
      const orderItems = [
        { id: 30, orderId: 200, productId: 1, productNameSnapshot: "Atta", quantity: 2 },
        { id: 31, orderId: 200, productId: 2, productNameSnapshot: "Dal", quantity: 1 },
      ];
      const { tx } = createRecoveryMockTx({ orderItems });
      await expect(
        executeReturnRecovery(tx, {
          order: { ...failedOrder },
          actorUserId: 15,
          actorRole: "vendor",
          inspectionNotes: "Omitted item test",
          items: [{ orderItemId: 30, restockedQuantity: 2, damagedQuantity: 0 }],
        })
      ).rejects.toThrowError(/Recovery must specify all 2 items belonging to this order/);
    });
  });

  describe("Strengthened development authentication isolation", () => {
    it("accepts allowlisted local database URLs (mtm_dev_*, mtm_local_*, mtm_test_*, mtm_e2e_*)", () => {
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://root:pass@localhost:3306/mtm_dev_demo")).not.toThrow();
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@127.0.0.1:3306/mtm_dev_test")).not.toThrow();
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@localhost:3306/mtm_local_db")).not.toThrow();
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@[::1]:3306/mtm_test_suite")).not.toThrow();
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@localhost:3306/mtm_e2e_sandbox")).not.toThrow();
    });

    it("rejects non-allowlisted database names even on local loopback hosts", () => {
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://root:pass@localhost:3306/mytownmarket_prod")).toThrow(TRPCError);
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://root:pass@localhost:3306/mytownmarket_prod")).toThrowError(
        /Database 'mytownmarket_prod' is not permitted for development authentication/
      );
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@127.0.0.1:3306/production")).toThrow(TRPCError);
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@127.0.0.1:3306/production")).toThrowError(
        /Database 'production' is not permitted for development authentication/
      );
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@localhost:3306/real_data")).toThrow(TRPCError);
    });

    it("rejects remote or shared database hosts for standalone dev login", () => {
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@aws-rds.amazon.com:3306/mtm_dev")).toThrow(TRPCError);
      expect(() => verifyIsolatedDevDatabaseUrl("mysql://user:pass@aws-rds.amazon.com:3306/mtm_dev")).toThrowError(
        /prohibited on remote or shared database hosts/
      );
    });

    it("rejects malformed or empty database URLs", () => {
      expect(() => verifyIsolatedDevDatabaseUrl("")).toThrow(TRPCError);
      expect(() => verifyIsolatedDevDatabaseUrl(undefined)).toThrow(TRPCError);
      expect(() => verifyIsolatedDevDatabaseUrl("not-a-valid-url")).toThrow(TRPCError);
    });

    it("rejects development authentication in cloud environments (VERCEL, RENDER, RAILWAY, etc.)", () => {
      const validReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000" },
      };

      try {
        process.env.VERCEL = "1";
        expect(() => verifyLocalHostRequest(validReq)).toThrow(TRPCError);
        expect(() => verifyLocalHostRequest(validReq)).toThrowError(
          /strictly prohibited in hosted cloud environments \(VERCEL detected\)/
        );
      } finally {
        delete process.env.VERCEL;
      }

      try {
        process.env.RAILWAY_ENVIRONMENT = "production";
        expect(() => verifyLocalHostRequest(validReq)).toThrow(TRPCError);
        expect(() => verifyLocalHostRequest(validReq)).toThrowError(
          /strictly prohibited in hosted cloud environments \(RAILWAY_ENVIRONMENT detected\)/
        );
      } finally {
        delete process.env.RAILWAY_ENVIRONMENT;
      }
    });

    it("rejects public tunnel headers (ngrok-trace-id, cf-ray, localtunnel-id)", () => {
      const ngrokReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000", "ngrok-trace-id": "ngrok-id-12345" },
      };
      expect(() => verifyLocalHostRequest(ngrokReq)).toThrow(TRPCError);
      expect(() => verifyLocalHostRequest(ngrokReq)).toThrowError(
        /cannot be accessed through public tunnels or external reverse proxies/
      );

      const cfReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000", "cf-ray": "8d3e23f124-BOM" },
      };
      expect(() => verifyLocalHostRequest(cfReq)).toThrow(TRPCError);

      const ltReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000", "localtunnel-id": "lt-abc" },
      };
      expect(() => verifyLocalHostRequest(ltReq)).toThrow(TRPCError);
    });

    it("rejects remote x-real-ip proxy headers", () => {
      const remoteRealIpReq = {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "localhost:3000", "x-real-ip": "198.51.100.45" },
      };
      expect(() => verifyLocalHostRequest(remoteRealIpReq)).toThrow(TRPCError);
      expect(() => verifyLocalHostRequest(remoteRealIpReq)).toThrowError(
        /cannot be accessed through a remote proxy \(x-real-ip\)/
      );
    });

    it("enforces loopback binding (127.0.0.1) when MTM_ENABLE_DEV_AUTH=1 in local development", () => {
      const config = resolveServerListenConfig({
        MTM_ENABLE_DEV_AUTH: "1",
        NODE_ENV: "development",
        PORT: "3000",
      });
      expect(config.host).toBe("127.0.0.1");
      expect(config.port).toBe(3000);
    });

    it("fails closed when MTM_ENABLE_DEV_AUTH=1 in production", () => {
      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "production",
          PORT: "3000",
        })
      ).toThrowError(/strictly forbidden in production/);
    });

    it("fails closed when MTM_ENABLE_DEV_AUTH=1 in public preview", () => {
      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          PUBLIC_PREVIEW: "1",
          PORT: "3000",
        })
      ).toThrowError(/strictly forbidden/);
    });

    it("fails closed when MTM_ENABLE_DEV_AUTH=1 in cloud environments", () => {
      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          VERCEL: "1",
        })
      ).toThrowError(/strictly forbidden in production, staging, public preview, or cloud-hosted environments/);

      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          RAILWAY_ENVIRONMENT: "production",
        })
      ).toThrowError(/cloud-hosted environments/);
    });

    it("fails closed when external or wildcard host is configured with MTM_ENABLE_DEV_AUTH=1", () => {
      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          HOST: "0.0.0.0",
        })
      ).toThrowError(/Prohibited binding to external\/wildcard interface '0.0.0.0'/);

      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          HOST: "192.168.1.100",
        })
      ).toThrowError(/Prohibited binding to external\/wildcard interface/);
    });

    it("fails closed if DATABASE_URL is not an allowlisted development database when dev auth is enabled", () => {
      expect(() =>
        resolveServerListenConfig({
          MTM_ENABLE_DEV_AUTH: "1",
          NODE_ENV: "development",
          DATABASE_URL: "mysql://localhost:3306/production_db",
        })
      ).toThrowError(/not permitted for development authentication/);
    });

    it("defaults to 0.0.0.0 when development authentication is disabled", () => {
      const config = resolveServerListenConfig({
        NODE_ENV: "production",
        PORT: "8080",
      });
      expect(config.host).toBe("0.0.0.0");
      expect(config.port).toBe(8080);
    });
  });
});

