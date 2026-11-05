import { TRPCError } from "@trpc/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "failed_delivery";
export type ActorKind = "customer" | "vendor" | "admin" | "rider";
/**
 * Derive an in-app handover code from a server-only signing secret and order ID.
 * The code is never persisted or returned outside the authenticated customer's
 * own order-detail query. Stable derivation lets retries survive app reloads.
 */
export function deriveHandoverCode(orderId: number, secret = process.env.MANUS_JWT_SECRET ?? "") {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || secret.length < 32)
    throw new Error("Handover proof is not configured");
  const digest = createHmac("sha256", secret)
    .update(`mytown-market-handover-v1:${orderId}`)
    .digest();
  return String(digest.readUInt32BE(0) % 100_000_000).padStart(8, "0");
}
export function verifyHandoverCode(orderId: number, candidate: string, secret = process.env.MANUS_JWT_SECRET ?? "") {
  if (!/^\d{8}$/.test(candidate) || secret.length < 32) return false;
  const expected = Buffer.from(deriveHandoverCode(orderId, secret), "ascii");
  const supplied = Buffer.from(candidate, "ascii");
  return timingSafeEqual(expected, supplied);
}
export type FulfillmentType = "delivery" | "pickup";

const vendorAllowedByFulfillment: Record<
  FulfillmentType,
  Partial<Record<OrderStatus, OrderStatus[]>>
> = {
  pickup: {
    placed: ["accepted", "rejected"],
    accepted: ["preparing", "rejected"],
    preparing: ["ready", "rejected"],
    ready: ["delivered"],
  },
  delivery: {
    placed: ["accepted", "rejected"],
    accepted: ["preparing", "rejected"],
    preparing: ["ready", "rejected"],
    ready: ["out_for_delivery"],
    out_for_delivery: ["delivered", "failed_delivery"],
  },
};

const allowed: Record<
  ActorKind,
  Partial<Record<OrderStatus, OrderStatus[]>>
> = {
  customer: { placed: ["cancelled"], accepted: ["cancelled"] },
  vendor: {
    placed: ["accepted", "rejected"],
    accepted: ["preparing", "rejected"],
    preparing: ["ready", "rejected"],
    ready: ["out_for_delivery", "delivered"],
    out_for_delivery: ["delivered", "failed_delivery"],
  },
  admin: {
    placed: ["cancelled", "rejected"],
    accepted: ["cancelled", "rejected"],
    preparing: ["cancelled", "rejected"],
    ready: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["failed_delivery", "delivered"],
  },
  rider: {
    ready: ["out_for_delivery"],
    out_for_delivery: ["delivered", "failed_delivery"],
  },
};
export function assertOrderTransition(
  actor: ActorKind,
  from: OrderStatus,
  to: OrderStatus,
  fulfillmentType?: FulfillmentType
) {
  if (actor === "vendor") {
    const fType: FulfillmentType = fulfillmentType ?? "delivery";
    const allowedTransitions = vendorAllowedByFulfillment[fType][from];
    if (!allowedTransitions?.includes(to)) {
      if (fType === "pickup" && to === "out_for_delivery") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pickup orders cannot be dispatched out for delivery.",
        });
      }
      if (fType === "delivery" && from === "ready" && to === "delivered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Delivery orders must be dispatched (out_for_delivery) before they can be marked delivered.",
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid vendor order transition for ${fType} order: ${from} → ${to}`,
      });
    }
  } else {
    if (!allowed[actor][from]?.includes(to))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid ${actor} order transition: ${from} → ${to}`,
      });
  }
  if (
    to === "rejected" &&
    actor === "vendor" &&
    from !== "placed" &&
    from !== "accepted" &&
    from !== "preparing"
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This order can no longer be rejected",
    });
}
export function calculateOrderTotals(input: {
  items: Array<{ pricePaise: number; quantity: number }>;
  deliveryFeePaise: number;
  platformFeePaise: number;
  commissionBps: number;
}) {
  const money = [...input.items.map(item => item.pricePaise), input.deliveryFeePaise, input.platformFeePaise];
  if (money.some(amount => !Number.isSafeInteger(amount) || amount < 0 || amount > 2_147_483_647) ||
      !Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 10_000)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Prices and fees must be non-negative integer paise with a valid commission rate" });
  if (
    !input.items.length ||
    input.items.some(
      i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100
    )
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Order items and quantities are invalid",
    });
  const subtotalPaise = input.items.reduce(
    (s, i) => s + i.pricePaise * i.quantity,
    0
  );
  const commissionPaise = Math.floor(
    (subtotalPaise * input.commissionBps) / 10_000
  );
  const totalPaise =
    subtotalPaise + input.deliveryFeePaise + input.platformFeePaise;
  if (!Number.isSafeInteger(totalPaise) || totalPaise > 2_147_483_647)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Order total exceeds the supported INR amount",
    });
  return {
    subtotalPaise,
    discountPaise: 0,
    deliveryFeePaise: input.deliveryFeePaise,
    platformFeePaise: input.platformFeePaise,
    taxPaise: 0,
    commissionPaise,
    totalPaise,
  };
}
export type OrderLedgerEntry = {
  orderId: number;
  vendorId: number | null;
  kind: "sale" | "commission" | "delivery_fee" | "platform_fee";
  amountPaise: number;
  status: "pending";
};
export function makeOrderLedgerEntries(input: {
  orderId: number;
  vendorId: number;
  subtotalPaise: number;
  commissionPaise: number;
  deliveryFeePaise: number;
  platformFeePaise: number;
}): OrderLedgerEntry[] {
  const amounts = [
    input.subtotalPaise,
    input.commissionPaise,
    input.deliveryFeePaise,
    input.platformFeePaise,
  ];
  if (amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Financial ledger amounts must be non-negative integer paise",
    });
  const entries: OrderLedgerEntry[] = [
    {
      orderId: input.orderId,
      vendorId: input.vendorId,
      kind: "sale",
      amountPaise: input.subtotalPaise,
      status: "pending",
    },
    {
      orderId: input.orderId,
      vendorId: input.vendorId,
      kind: "commission",
      amountPaise: input.commissionPaise,
      status: "pending",
    },
  ];
  if (input.deliveryFeePaise > 0)
    entries.push({
      orderId: input.orderId,
      vendorId: input.vendorId,
      kind: "delivery_fee",
      amountPaise: input.deliveryFeePaise,
      status: "pending",
    });
  if (input.platformFeePaise > 0)
    entries.push({
      orderId: input.orderId,
      vendorId: null,
      kind: "platform_fee",
      amountPaise: input.platformFeePaise,
      status: "pending",
    });
  return entries;
}
export function assertServesZone(
  vendorZoneId: number,
  orderZoneId: number,
  deliveryEnabled: boolean
) {
  if (vendorZoneId !== orderZoneId || !deliveryEnabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This shop cannot serve the selected delivery area",
    });
}
export function makeAddressSnapshot(address: {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  postalCode: string | null;
  townId: number;
  zoneId: number;
}) {
  return { ...address };
}

/**
 * Ensures vendor fulfillment mutations cannot usurp or conflict with an active platform rider.
 * Covers dispatch (out_for_delivery), completion (delivered), and failure reporting (failed_delivery).
 */
export function assertNoActiveRiderAssignment(
  activeAssignment: { id: number; status: string } | null | undefined,
  targetStatus: OrderStatus
): void {
  const guardedStatuses: OrderStatus[] = [
    "out_for_delivery",
    "delivered",
    "failed_delivery",
  ];
  const activeRiderStatuses = ["assigned", "accepted", "arrived", "picked_up"];

  if (
    guardedStatuses.includes(targetStatus) &&
    activeAssignment &&
    activeRiderStatuses.includes(activeAssignment.status)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This order has an active platform rider assignment. Delivery fulfillment, completion, and failure reports must be managed by the assigned rider or platform administrator.",
    });
  }
}
