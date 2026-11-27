import { browseInput, browseRows } from "./marketplace/browse";
import {activeOffer,effectiveProduct} from "../shared/offers";
import {validShopHours,withinShopHours} from '../shared/shop-hours';
import {logoutMobileRequest} from './auth/mobile-auth';
import {vendorBridgeContext} from "./marketplace/vendor-context";
import { reserveForCheckout, attachCheckout, trustedCheckoutStock, orderSyncStatus, refreshLinkedEligibility } from "./integrations/apna-galla/sandbox";
import { assertSandbox, productionConnector, sandboxEnabled } from "./integrations/apna-galla/config";
import { publishedSellerCondition, publishedProductCondition } from "./marketplace/publication-policy";
import { isReviewDemo } from "./auth/review-demo-context";
import { logoutReviewRequest } from "./auth/review-demo";
import { randomUUID } from "node:crypto";
import { connectorStatus } from './integrations/apna-galla/adapter';
import { answerLocalHelp, localAssistantEnabled } from './marketplace/local-assistant';
import { checkoutInput } from "../shared/checkout";
import { duplicateCheckout, prepareCheckout, requestFingerprint } from "./marketplace/checkout";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { and, asc, desc, eq, inArray, ilike, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { parseLocalDatabaseConfig } from "./marketplace/database-config";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { storagePut } from "./storage";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import {
  auditRecords,
  categories,
  customerAddresses,
  customerProfiles,
  customerPhoneIdentities,
  deliveryAssignments,
  financialLedger,
  favoriteShops,
  orderEvents,
  orderItems,
  orders,
  paymentRecords,
  platformSettings,
  products,
  riderProfiles,
  serviceZones,
  shopReviews,
  supportMessages,
  supportTickets,
  towns,
  users,
  vendorProfiles,
} from "../drizzle/schema";
import {
  assertNoActiveRiderAssignment,
  assertOrderTransition,
  deriveHandoverCode,
  makeOrderLedgerEntries,
  verifyHandoverCode,
  type ActorKind,
  type OrderStatus,
} from "./marketplace/domain";

const failUnavailable = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Marketplace database is unavailable",
  });
const shopCategories = alias(categories, "shop_categories");
async function database() {
  const db = (vendorBridgeContext.getStore()?.db || await getDb()) as Awaited<ReturnType<typeof getDb>>;
  if (!db) throw failUnavailable();
  return db;
}
async function requireActiveServiceZone(db: any, townId: number, zoneId: number) {
  const [zone] = await db
    .select({ id: serviceZones.id })
    .from(serviceZones)
    .innerJoin(towns, eq(serviceZones.townId, towns.id))
    .where(
      and(
        eq(serviceZones.id, zoneId),
        eq(serviceZones.townId, townId),
        eq(serviceZones.active, true),
        eq(towns.active, true)
      )
    )
    .limit(1);
  if (!zone)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose an active service area in the selected town",
    });
}
async function vendorFor(userId: number, approved = true) {
  const db = await database();
  const [v] = await db
    .select()
    .from(vendorProfiles)
    .where(and(eq(vendorProfiles.userId,userId),...(vendorBridgeContext.getStore()?[eq(vendorProfiles.id,vendorBridgeContext.getStore()!.vendorId)]:[])))
    .limit(1);
  if (!v)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vendor registration is required",
    });
  if (approved && v.status !== "approved" && !(vendorBridgeContext.getStore() && v.status==="suspended"))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vendor account is not approved",
    });
  return v;
}
async function riderFor(userId: number, approved = true) {
  const db = await database();
  const [r] = await db
    .select()
    .from(riderProfiles)
    .where(eq(riderProfiles.userId, userId))
    .limit(1);
  if (!r)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Rider registration is required",
    });
  if (approved && r.status !== "approved")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Rider account is not approved",
    });
  return r;
}
async function writeAudit(
  executor: any,
  actor: number,
  action: string,
  type: string,
  id: number | null,
  details?: Record<string, unknown>
) {
  await executor.insert(auditRecords).values({
    actorUserId: actor,
    action,
    entityType: type,
    entityId: id,
    details: details ?? null,
  }).returning({ insertId: auditRecords.id });
}
async function audit(
  actor: number,
  action: string,
  type: string,
  id: number | null,
  details?: Record<string, unknown>
) {
  await writeAudit(await database(), actor, action, type, id, details);
}
async function voidUncollectedOrder(tx: any, order: typeof orders.$inferSelect, reason: string) {
  const [payment] = await tx
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.orderId, order.id))
    .for("update")
    .limit(1);
  if (order.paymentStatus === "collected" || payment?.status === "collected")
    throw new TRPCError({
      code: "CONFLICT",
      message: "Cash is recorded as collected; an authorized refund workflow is required",
    });
  if (payment?.recordedAt)
    throw new TRPCError({
      code: "CONFLICT",
      message: "A cash amount has been recorded; admin reconciliation is required before cancellation",
    });
  if (payment?.status === "pending")
    await tx
      .update(paymentRecords)
      .set({ status: "voided", reference: reason.slice(0, 120) || "Order voided before collection" })
      .where(eq(paymentRecords.id, payment.id));
  await tx.update(orders).set({ paymentStatus: "voided" }).where(eq(orders.id, order.id));
  await tx
    .update(financialLedger)
    .set({ status: "reversed", note: `Voided: ${reason}`.slice(0, 1000) })
    .where(and(eq(financialLedger.orderId, order.id), eq(financialLedger.status, "pending")));
}

/**
 * Shared business service for recording failed delivery across Vendor, Rider, and Admin actors.
 * Enforces:
 * 1. Prohibits silent voiding if cash was already recorded or collected.
 * 2. Voids outstanding pending payment record.
 * 3. Reverses pending financial ledger entries.
 * 4. Preserves inventory in transit (does NOT restore products.stockQuantity or set orders.stockRestoredAt).
 * 5. Updates delivery assignment (if any) to status "failed".
 * 6. Records order history timeline (orderEvents) and security audit log (auditRecords).
 */
export async function executeFailedDeliveryTransition(
  tx: any,
  params: {
    order: typeof orders.$inferSelect;
    actorUserId: number;
    actorRole: ActorKind;
    reason: string;
    assignmentId?: number;
  }
) {
  const { order, actorUserId, actorRole, reason, assignmentId } = params;
  const failureReason = reason.trim();
  if (!failureReason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A failure reason is required when reporting failed delivery.",
    });
  }

  // 1. Prohibit silent voiding if cash was already collected or recorded; void payment & reverse ledger
  await voidUncollectedOrder(tx, order, failureReason);

  // 2. Update order status to failed_delivery (preserving inventory until physical return and inspection)
  await tx
    .update(orders)
    .set({
      status: "failed_delivery",
      cancelReason: failureReason,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  // 3. Mark delivery assignment failed if present
  if (assignmentId) {
    await tx
      .update(deliveryAssignments)
      .set({
        status: "failed",
        deliveryProof: failureReason,
        updatedAt: new Date(),
      })
      .where(eq(deliveryAssignments.id, assignmentId));
  } else {
    await tx
      .update(deliveryAssignments)
      .set({
        status: "failed",
        deliveryProof: failureReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deliveryAssignments.orderId, order.id),
          inArray(deliveryAssignments.status, [
            "assigned",
            "accepted",
            "arrived",
            "picked_up",
          ])
        )
      );
  }

  // 4. Log timeline event
  await tx.insert(orderEvents).values({
    orderId: order.id,
    actorUserId,
    actorRole,
    fromStatus: order.status,
    toStatus: "failed_delivery",
    note: failureReason,
    metadata: {
      action: "failed_delivery",
      reason: failureReason,
      actorRole,
      inventoryPreserved: true,
    },
  }).returning({ insertId: orderEvents.id });

  // 5. Write audit entry
  await writeAudit(
    tx,
    actorUserId,
    "order.delivery_failed",
    "order",
    order.id,
    {
      actorRole,
      reason: failureReason,
      fromStatus: order.status,
      inventoryPreserved: true,
    }
  );

  return {
    success: true as const,
    status: "failed_delivery" as const,
    cashRecorded: false as const,
    cashCollected: false as const,
    variancePaise: 0 as const,
  };
}

export const returnRecoveryItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  restockedQuantity: z.number().int().min(0),
  damagedQuantity: z.number().int().min(0),
  missingQuantity: z.number().int().min(0).default(0),
  dispositionNotes: z.string().trim().max(500).optional(),
});

export type ReturnRecoveryItemInput = z.infer<typeof returnRecoveryItemSchema>;

/**
 * Shared business service for quantity-accurate return recovery across Vendor and Admin actors.
 * Enforces:
 * 1. Requires order status to be 'failed_delivery'.
 * 2. Rejects concurrent or duplicate recovery requests.
 * 3. Validates each item belongs to the order.
 * 4. Validates quantities are nonnegative integers and exact match line quantities (restocked + damaged + missing === ordered).
 * 5. Rejects unknown and duplicate order item IDs.
 * 6. Atomically updates product inventory and order_items records (only restocked units increase stock).
 * 7. Writes order history timeline and security audit log with item breakdown.
 */
export async function executeReturnRecovery(
  tx: any,
  params: {
    order: typeof orders.$inferSelect;
    actorUserId: number;
    actorRole: "vendor" | "admin";
    inspectionNotes: string;
    items: ReturnRecoveryItemInput[];
  }
) {
  const { order, actorUserId, actorRole, inspectionNotes, items } = params;

  if (order.status !== "failed_delivery") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Return recovery can only be performed on orders with status 'failed_delivery'.",
    });
  }
  if (order.returnReceivedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Parcel return has already been recorded and processed for this order.",
    });
  }

  type OrderItemRecord = typeof orderItems.$inferSelect;
  const lines: OrderItemRecord[] = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  const linesMap = new Map<number, OrderItemRecord>(lines.map(l => [l.id, l]));
  const seenItemIds = new Set<number>();
  let totalRestocked = 0;
  let totalDamaged = 0;
  let totalMissing = 0;

  for (const item of items) {
    // 1. Unknown and duplicate order item IDs are rejected
    if (seenItemIds.has(item.orderItemId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Duplicate recovery entry for order item ${item.orderItemId}.`,
      });
    }
    seenItemIds.add(item.orderItemId);

    const line = linesMap.get(item.orderItemId);
    if (!line) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Order item ${item.orderItemId} does not belong to order ${order.id}.`,
      });
    }

    const missingQuantity = item.missingQuantity ?? 0;

    // 2. Quantities are nonnegative integers
    if (
      !Number.isInteger(item.restockedQuantity) ||
      item.restockedQuantity < 0 ||
      !Number.isInteger(item.damagedQuantity) ||
      item.damagedQuantity < 0 ||
      !Number.isInteger(missingQuantity) ||
      missingQuantity < 0
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Recovery quantities for item ${item.orderItemId} must be nonnegative integers.`,
      });
    }

    // 3. Recovery quantities do not exceed ordered quantities & all quantities are accounted for
    const itemTotal = item.restockedQuantity + item.damagedQuantity + missingQuantity;
    if (itemTotal !== line.quantity) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Order item ${item.orderItemId} (${line.productNameSnapshot}) has quantity ${line.quantity}, but recovery specified ${item.restockedQuantity} restocked, ${item.damagedQuantity} damaged, and ${missingQuantity} missing (total ${itemTotal}). All returned/missing units must be accounted for (restockedQuantity + damagedQuantity + missingQuantity === orderedQuantity).`,
      });
    }

    totalRestocked += item.restockedQuantity;
    totalDamaged += item.damagedQuantity;
    totalMissing += missingQuantity;
  }

  // 4. Must specify all items belonging to the order
  if (seenItemIds.size !== lines.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Recovery must specify all ${lines.length} items belonging to this order.`,
    });
  }

  // 5. Determine disposition condition
  const condition =
    totalDamaged === 0 && totalMissing === 0
      ? "restocked"
      : totalRestocked === 0
        ? totalDamaged > 0 && totalMissing > 0
          ? "shrinkage_and_missing"
          : totalMissing > 0
            ? "total_missing"
            : "damaged_shrinkage"
        : "partial_loss";

  // 6. Atomically update inventory and order_items
  for (const item of items) {
    const line = linesMap.get(item.orderItemId)!;
    if (item.restockedQuantity > 0 && line.productId) {
      await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${item.restockedQuantity}`,
        })
        .where(eq(products.id, line.productId));
    }
    await tx
      .update(orderItems)
      .set({
        restockedQuantity: item.restockedQuantity,
        damagedQuantity: item.damagedQuantity,
        missingQuantity: item.missingQuantity ?? 0,
      })
      .where(eq(orderItems.id, item.orderItemId));
  }

  const now = new Date();

  // 7. Update orders record
  await tx
    .update(orders)
    .set({
      returnReceivedAt: now,
      returnCondition: condition,
      returnNotes: inspectionNotes.trim(),
      stockRestoredAt: totalRestocked > 0 ? now : null,
    })
    .where(eq(orders.id, order.id));

  // 8. Log timeline event and audit record with full item breakdown
  const itemSummary = items.map(it => {
    const line = linesMap.get(it.orderItemId)!;
    return {
      orderItemId: it.orderItemId,
      productName: line.productNameSnapshot,
      ordered: line.quantity,
      restocked: it.restockedQuantity,
      damaged: it.damagedQuantity,
      missing: it.missingQuantity ?? 0,
      notes: it.dispositionNotes ?? null,
    };
  });

  await tx.insert(orderEvents).values({
    orderId: order.id,
    actorUserId,
    actorRole,
    fromStatus: "failed_delivery",
    toStatus: "failed_delivery",
    note: `Parcel returned and inspected (${condition}). Restocked: ${totalRestocked}, Damaged: ${totalDamaged}, Missing: ${totalMissing}. Notes: ${inspectionNotes.trim()}`,
    metadata: {
      action: "return_recovery",
      condition,
      totalRestocked,
      totalDamaged,
      totalMissing,
      notes: inspectionNotes.trim(),
      items: itemSummary,
      returnReceivedAt: now.toISOString(),
    },
  }).returning({ insertId: orderEvents.id });

  await writeAudit(
    tx,
    actorUserId,
    "order.return_recovered",
    "order",
    order.id,
    {
      actorRole,
      condition,
      totalRestocked,
      totalDamaged,
      totalMissing,
      notes: inspectionNotes.trim(),
      items: itemSummary,
    }
  );

  return {
    success: true as const,
    orderId: order.id,
    condition,
    totalRestocked,
    totalDamaged,
    totalMissing,
    returnReceivedAt: now,
  };
}

async function recordCashCollection(
  tx: any,
  order: typeof orders.$inferSelect,
  actorUserId: number,
  actorRole: ActorKind,
  amountPaise: number,
  note?: string
) {
  const [payment] = await tx
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.orderId, order.id))
    .for("update")
    .limit(1);
  if (!payment || payment.method !== order.paymentMethod || payment.status !== "pending")
    throw new TRPCError({ code: "CONFLICT", message: "This cash payment is not open for collection" });
  if (payment.recordedAt)
    throw new TRPCError({ code: "CONFLICT", message: "A cash collection is already recorded for this order" });
  const exact = amountPaise === order.totalPaise;
  const variancePaise = amountPaise - order.totalPaise;
  const recordedAt = new Date();
  await tx
    .update(paymentRecords)
    .set({
      collectedAmountPaise: amountPaise,
      status: exact ? "collected" : "pending",
      reference: note?.trim().slice(0, 120) || null,
      recordedBy: actorUserId,
      recordedAt,
    })
    .where(eq(paymentRecords.id, payment.id));
  if (exact) {
    await tx.update(orders).set({ paymentStatus: "collected" }).where(eq(orders.id, order.id));
    await tx
      .update(financialLedger)
      .set({ status: "recorded" })
      .where(and(eq(financialLedger.orderId, order.id), eq(financialLedger.status, "pending")));
  }
  await tx.insert(orderEvents).values({
    orderId: order.id,
    actorUserId,
    actorRole,
    fromStatus: order.status,
    toStatus: exact ? "cash_collected" : "cash_variance",
    note: note?.trim() || (exact ? "Cash collection recorded at verified handover" : "Cash amount differs from order total; admin review required"),
    metadata: {
      paymentMethod: order.paymentMethod,
      expectedPaise: order.totalPaise,
      collectedPaise: amountPaise,
      variancePaise,
      exact,
    },
  }).returning({ insertId: orderEvents.id });
  await writeAudit(tx, actorUserId, "cash.collection_recorded", "order", order.id, {
    paymentMethod: order.paymentMethod,
    expectedPaise: order.totalPaise,
    collectedPaise: amountPaise,
    variancePaise,
    exact,
  });
  return { cashRecorded: true, cashCollected: exact, variancePaise };
}
const MAX_HANDOVER_ATTEMPTS = 5;
async function recordHandoverFailure(
  tx: any,
  order: typeof orders.$inferSelect,
  actorUserId: number,
  actorRole: ActorKind
): Promise<"invalid" | "locked"> {
  if (order.handoverLockedAt) return "locked";
  const attempts = order.handoverAttempts + 1;
  const locked = attempts >= MAX_HANDOVER_ATTEMPTS;
  const lockTime = locked ? new Date() : null;
  await tx.update(orders).set({
    handoverAttempts: attempts,
    ...(locked ? { handoverLockedAt: lockTime } : {}),
  }).where(eq(orders.id, order.id));
  await tx.insert(orderEvents).values({
    orderId: order.id,
    actorUserId,
    actorRole,
    fromStatus: order.status,
    toStatus: locked ? "handover_locked" : "handover_attempt_failed",
    metadata: { attempts, locked, lockTime },
  }).returning({ insertId: orderEvents.id });
  if (locked)
    await writeAudit(tx, actorUserId, "handover.locked", "order", order.id, { attempts });
  return locked ? "locked" : "invalid";
}
async function insertOrderEvent(
  orderId: number,
  actorUserId: number,
  actorRole: ActorKind,
  from: string | null,
  to: string,
  note?: string | null
) {
  const db = await database();
  await db
    .insert(orderEvents)
    .values({
      orderId,
      actorUserId,
      actorRole,
      fromStatus: from,
      toStatus: to,
      note: note ?? null,
    }).returning({ insertId: orderEvents.id });
}
const idInput = z.object({ id: z.number().int().positive() });
const imageUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(1).max(2_800_000),
});
function decodeImageUpload(contentType: string, dataBase64: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image encoding" });
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length < 16 || bytes.length > 2 * 1024 * 1024)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Images must be no larger than 2 MB" });
  const isJpeg = contentType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = contentType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = contentType === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid JPEG, PNG or WebP image" });
  return bytes;
}
const productInput = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(180),
  description: z.string().max(5000).optional(),
  unit: z.string().trim().min(1).max(48),
  pricePaise: z.number().int().min(0).max(100_000_000),
  mrpPaise: z.number().int().min(0).max(100_000_000).optional(),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  availability: z.enum(["available", "unavailable"]).optional(),
});
function publicShop(
  shop: typeof vendorProfiles.$inferSelect,
  zone: typeof serviceZones.$inferSelect,
  category: typeof categories.$inferSelect,
  townName: string
) {
  return {
    id: shop.id,
    slug: shop.slug,
    shopName: shop.shopName,
    description: shop.description,
    address: shop.address,
    logoUrl: shop.logoUrl,
    coverUrl: shop.coverUrl,
    isOpen: shop.isOpen && (process.env.MTM_APNA_SANDBOX_ENABLED!=='1'||withinShopHours(shop.settings)),
    isDemo: shop.isDemo,
    deliveryEnabled: shop.deliveryEnabled,
    pickupEnabled: shop.pickupEnabled,
    deliveryFeePaise: shop.deliveryFeePaise,
    platformFeePaise: shop.platformFeePaise,
    minimumOrderPaise: shop.minimumOrderPaise,
    preparationMinutes: shop.preparationMinutes,
    openingTime:
      typeof shop.settings?.openingTime === "string"
        ? shop.settings.openingTime
        : null,
    closingTime:
      typeof shop.settings?.closingTime === "string"
        ? shop.settings.closingTime
        : null,
    locality: zone.locality,
    town: townName,
    townId: shop.townId,
    zoneId: shop.zoneId,
    category,
  };
}
function publicProduct(raw: typeof products.$inferSelect) {
  const product=effectiveProduct(raw);
  return {
    id: product.id,
    vendorId: product.vendorId,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    unit: product.unit,
    pricePaise: product.pricePaise,
    offer:activeOffer(product.offerMeta),
    gstIncluded: Boolean(product.taxMeta && product.taxMeta.gstBps > 0),
    mrpPaise: product.mrpPaise,
    inStock: product.stockQuantity > 0,
    availability: product.availability,
    imageUrl: product.imageUrl,
    isDemo: product.isDemo,
  };
}

async function shopRatingMap(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, vendorIds: number[]) {
  if (!vendorIds.length) return new Map<number, { average: number; count: number }>();
  const rows = await db.select({
    vendorId: shopReviews.vendorId,
    average: sql<number>`avg(${shopReviews.rating})`,
    count: sql<number>`count(${shopReviews.id})`,
  }).from(shopReviews).where(inArray(shopReviews.vendorId, vendorIds)).groupBy(shopReviews.vendorId);
  return new Map(rows.map(row => [row.vendorId, { average: Number(row.average), count: Number(row.count) }]));
}
function withShopRating<T extends { id: number }>(shop: T, ratings: Map<number, { average: number; count: number }>) {
  const rating = ratings.get(shop.id);
  return { ...shop, ratingAverage: rating?.average ?? null, ratingCount: rating?.count ?? 0 };
}

export const SERVER_TEST_PERSONAS = {
  customer: {
    openId: "dev-persona-customer-01",
    name: "Aarti Sharma (Dev Customer)",
    email: "dev-customer@mytownmarket.test",
    role: "user" as const,
  },
  vendor: {
    openId: "dev-persona-vendor-01",
    name: "Rajesh Kirana (Dev Vendor)",
    email: "dev-vendor@mytownmarket.test",
    role: "user" as const,
  },
  rider: {
    openId: "dev-persona-rider-01",
    name: "Vikram Singh (Dev Rider)",
    email: "dev-rider@mytownmarket.test",
    role: "user" as const,
  },
  admin: {
    openId: "dev-persona-admin-01",
    name: "Local Dev Administrator",
    email: "dev-admin@mytownmarket.test",
    role: "admin" as const,
  },
} as const;

export type TestPersonaKey = keyof typeof SERVER_TEST_PERSONAS;

export function verifyIsolatedDevDatabaseUrl(rawUrl: string | undefined): void {
  if (!rawUrl) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Standalone development login requires a configured local database.",
    });
  }
  try {
    parseLocalDatabaseConfig(rawUrl, "development");
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: err instanceof Error ? err.message : "Invalid local database configuration. Refusing development login.",
    });
  }
}

export function verifyLocalHostRequest(req: any): void {
  // If running in automated vitest without a real socket, allow if test environment
  if (process.env.NODE_ENV === "test" && !req?.socket?.remoteAddress && !req?.headers?.host) {
    return;
  }

  // 1. Hosted cloud environment check: reject if running in any managed cloud provider
  const cloudEnvVars = [
    "VERCEL",
    "RENDER",
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_STATIC_URL",
    "FLY_ALLOC_ID",
    "HEROKU_APP_NAME",
    "K_SERVICE",
    "AWS_EXECUTION_ENV",
    "DYNO",
  ];
  for (const envVar of cloudEnvVars) {
    if (process.env[envVar]) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Standalone development authentication is strictly prohibited in hosted cloud environments (${envVar} detected).`,
      });
    }
  }

  // 2. Remote socket address check (cannot be spoofed by HTTP headers)
  const remoteAddress = (
    req?.socket?.remoteAddress ??
    req?.connection?.remoteAddress ??
    ""
  ).toLowerCase();

  const loopbackIps = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  if (remoteAddress && !loopbackIps.includes(remoteAddress)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Standalone development authentication can only be invoked from local loopback (127.0.0.1 / ::1). Remote network connections are forbidden.",
    });
  }

  // 3. Reject public tunnels and tunnel headers (e.g. ngrok, cloudflare tunnel, localtunnel)
  const headers = req?.headers ?? {};
  const tunnelHeaderNames = [
    "cf-ray",
    "cf-connecting-ip",
    "ngrok-trace-id",
    "x-ngrok-skip-browser-warning",
    "localtunnel-id",
  ];
  for (const h of tunnelHeaderNames) {
    if (headers[h]) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Standalone development authentication cannot be accessed through public tunnels or external reverse proxies.",
      });
    }
  }

  // 4. Proxy exposure check: reject if request arrived via an external proxy
  const xForwardedFor = headers["x-forwarded-for"];
  if (xForwardedFor) {
    const ips = String(xForwardedFor).split(",").map((s: string) => s.trim().toLowerCase());
    for (const ip of ips) {
      if (!loopbackIps.includes(ip)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Standalone development authentication cannot be accessed through a public proxy or external forwarder.",
        });
      }
    }
  }

  const xForwardedHost = headers["x-forwarded-host"];
  if (xForwardedHost) {
    const fHost = String(xForwardedHost).split(":")[0].trim().toLowerCase();
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(fHost)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Standalone development authentication cannot be exposed through an external proxy host.",
      });
    }
  }

  const xRealIp = headers["x-real-ip"];
  if (xRealIp && !loopbackIps.includes(String(xRealIp).trim().toLowerCase())) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Standalone development authentication cannot be accessed through a remote proxy (x-real-ip).",
    });
  }

  // 5. Strict Host header check (must be non-empty and strictly local)
  const reqHost = (headers.host ?? "").toLowerCase().split(":")[0].trim();
  const permittedHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
  const isLocalHost = permittedHosts.includes(reqHost);

  if (!isLocalHost) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Standalone development authentication cannot be accessed through an external or non-local host.",
    });
  }
}

function requireLocalMarketplace(req: any) {
  if (isReviewDemo()) return; // Authenticated requests use a distinct fictional database.
  // Public shopping requires the pinned, explicitly configured ERP connection.
  if (productionConnector()) { assertSandbox(); return; }
  if (ENV.isProduction || process.env.PUBLIC_PREVIEW === "1")
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The marketplace is not open for public shopping yet." });
  verifyLocalHostRequest(req);
  verifyIsolatedDevDatabaseUrl(process.env.DATABASE_URL);
}

const apnaVendorProcedure=protectedProcedure.use(async({next})=>{if((sandboxEnabled() || ENV.isProduction || process.env.PUBLIC_PREVIEW==='1')&&!vendorBridgeContext.getStore())throw new TRPCError({code:"FORBIDDEN",message:"Manage your shop through Apna Galla"});return next();});
export const appRouter = router({
  system: systemRouter,
  integration: router({ status: adminProcedure.query(() => connectorStatus()) }),
  localAssistant: router({
    status: publicProcedure.query(({ctx}) => {
      if(!localAssistantEnabled())return {enabled:false};
      requireLocalMarketplace(ctx.req);
      return {enabled:true};
    }),
    ask: protectedProcedure.input(z.object({question:z.string().trim().min(1).max(1200)})).mutation(({ctx,input}) => {
      verifyLocalHostRequest(ctx.req);
      verifyIsolatedDevDatabaseUrl(process.env.DATABASE_URL);
      return answerLocalHelp(ctx.user.id,input.question);
    }),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await logoutReviewRequest(ctx.req,ctx.res);
      await logoutMobileRequest(ctx.req,ctx.res);
      const options = getSessionCookieOptions(ctx.req);
      if (!ENV.isProduction && !process.env.PUBLIC_PREVIEW && (process.env.MTM_ENABLE_DEV_AUTH === "1" || process.env.ALLOW_STANDALONE_DEV_LOGIN === "1")) {
        try {
          verifyLocalHostRequest(ctx.req); verifyIsolatedDevDatabaseUrl(process.env.DATABASE_URL);
          Object.assign(options, { sameSite: "lax", secure: false });
        } catch { /* Hosted and non-local requests retain secure-cookie policy. */ }
      }
      ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
      return { success: true } as const;
    }),
    localDemoStatus: publicProcedure.query(({ ctx }) => {
      if (ENV.isProduction || process.env.NODE_ENV === "production" || process.env.PUBLIC_PREVIEW || !(process.env.MTM_ENABLE_DEV_AUTH === "1" || process.env.ALLOW_STANDALONE_DEV_LOGIN === "1")) return { enabled: false };
      try { verifyIsolatedDevDatabaseUrl(process.env.DATABASE_URL); verifyLocalHostRequest(ctx.req); return { enabled: true }; }
      catch { return { enabled: false }; }
    }),
    standaloneLogin: publicProcedure
      .input(
        z.object({
          persona: z.enum(["customer", "vendor", "rider", "admin"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const devAuthExplicitlyEnabled =
          process.env.MTM_ENABLE_DEV_AUTH === "1" ||
          process.env.ALLOW_STANDALONE_DEV_LOGIN === "1";
        if (!devAuthExplicitlyEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Standalone development authentication is disabled by default on this server.",
          });
        }
        if (
          ENV.isProduction ||
          process.env.NODE_ENV === "production" ||
          process.env.PUBLIC_PREVIEW === "1"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Standalone development authentication is strictly forbidden in production, public previews, and non-development environments.",
          });
        }
        verifyIsolatedDevDatabaseUrl(process.env.DATABASE_URL);
        verifyLocalHostRequest(ctx.req);

        if (input.persona === "admin") {
          const allowDevAdmin = process.env.ALLOW_DEV_ADMIN_LOGIN === "1";
          if (!allowDevAdmin) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Administrator test persona is disabled. Server configuration must explicitly enable ALLOW_DEV_ADMIN_LOGIN=1.",
            });
          }
        }

        const profile = SERVER_TEST_PERSONAS[input.persona];
        const role = profile.role;
        const db = await database();

        await db
          .insert(users)
          .values({
            openId: profile.openId,
            name: profile.name,
            email: profile.email,
            loginMethod: "standalone-dev-test",
            role,
            lastSignedIn: new Date(),
          })
          .onConflictDoUpdate({ target: [users.openId],
            set: {
              name: profile.name,
              email: profile.email,
              role,
              lastSignedIn: new Date(),
            },
          }).returning({ insertId: users.id });

        const sessionToken = await sdk.createSessionToken(profile.openId, {
          name: profile.name,
          expiresInMs: ONE_YEAR_MS,
        });
        // These guards permit only isolated loopback HTTP; Secure/None cookies
        // are rejected by the local Android WebView. Hosted auth stays unchanged.
        ctx.res.cookie(COOKIE_NAME, sessionToken, { httpOnly: true, path: "/", sameSite: "lax", secure: false, maxAge: ONE_YEAR_MS });
        const [user] = await db.select().from(users).where(eq(users.openId, profile.openId)).limit(1);
        return { success: true, user: user ?? null };
      }),
  }),
  account: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [customer] = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, ctx.user.id))
        .limit(1);
      const vendors = await db
        .select({
          id: vendorProfiles.id,
          status: vendorProfiles.status,
          shopName: vendorProfiles.shopName,
        })
        .from(vendorProfiles)
        .where(eq(vendorProfiles.userId, ctx.user.id));
      const [rider] = await db
        .select({
          id: riderProfiles.id,
          status: riderProfiles.status,
          available: riderProfiles.available,
        })
        .from(riderProfiles)
        .where(eq(riderProfiles.userId, ctx.user.id))
        .limit(1);
      return {
        user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
        verifiedMobile:ctx.user.loginMethod==='phone-otp'?(await db.select({phone:customerPhoneIdentities.phone}).from(customerPhoneIdentities).where(eq(customerPhoneIdentities.userId,ctx.user.id)).limit(1))[0]?.phone||null:null,
        role:
          ctx.user.role === "admin"
            ? "admin"
            : rider?.status === "approved"
              ? "rider"
              : vendors.some(v => v.status === "approved")
                ? "vendor"
                : "customer",
        customer: customer ?? null,
        vendor: vendors[0] ?? null,
        rider: rider ?? null,
        ownerBootstrapConfigured: Boolean(ENV.ownerOpenId || ENV.adminEmail),
      };
    }),
    profile: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [p] = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, ctx.user.id))
        .limit(1);
      return p ?? null;
    }),
    saveProfile: protectedProcedure
      .input(
        z.object({
          phone: z.string().trim().max(30).optional(),
          defaultTownId: z.number().int().positive().optional(),
          defaultZoneId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        if (
          input.defaultTownId !== undefined ||
          input.defaultZoneId !== undefined
        ) {
          if (
            input.defaultTownId === undefined ||
            input.defaultZoneId === undefined
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Town and service zone must be selected together",
            });
          const [zone] = await db
            .select()
            .from(serviceZones)
            .where(
              and(
                eq(serviceZones.id, input.defaultZoneId),
                eq(serviceZones.townId, input.defaultTownId),
                eq(serviceZones.active, true)
              )
            )
            .limit(1);
          const [activeTown] = await db
            .select({ id: towns.id })
            .from(towns)
            .where(
              and(eq(towns.id, input.defaultTownId), eq(towns.active, true))
            )
            .limit(1);
          if (!zone || !activeTown)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose an active service area",
            });
        }
        await db
          .insert(customerProfiles)
          .values({ userId: ctx.user.id, ...input })
          .onConflictDoUpdate({ target: [customerProfiles.userId],  set: input });
        return { success: true };
      }),
    addresses: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      return db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.userId, ctx.user.id))
        .orderBy(
          desc(customerAddresses.isDefault),
          desc(customerAddresses.updatedAt)
        );
    }),
    saveAddress: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
          label: z.string().trim().min(1).max(40),
          recipientName: z.string().trim().min(1).max(160),
          phone: z.string().trim().min(5).max(30),
          line1: z.string().trim().min(2).max(240),
          line2: z.string().trim().max(240).optional(),
          landmark: z.string().trim().max(180).optional(),
          postalCode: z.string().trim().max(12).optional(),
          isDefault: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [zone] = await db
          .select()
          .from(serviceZones)
          .where(
            and(
              eq(serviceZones.id, input.zoneId),
              eq(serviceZones.townId, input.townId),
              eq(serviceZones.active, true)
            )
          )
          .limit(1);
        const [activeTown] = await db
          .select({ id: towns.id })
          .from(towns)
          .where(and(eq(towns.id, input.townId), eq(towns.active, true)))
          .limit(1);
        if (!zone || !activeTown)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose an active service area",
          });
        const values = {
          userId: ctx.user.id,
          townId: input.townId,
          zoneId: input.zoneId,
          label: input.label,
          recipientName: input.recipientName,
          phone: input.phone,
          line1: input.line1,
          line2: input.line2 ?? null,
          landmark: input.landmark ?? null,
          postalCode: input.postalCode ?? null,
          isDefault: input.isDefault,
        };
        return db.transaction(async tx => {
          // Serialize this customer's address changes, including concurrent first defaults.
          await tx.select({ id: users.id }).from(users)
            .where(eq(users.id, ctx.user.id)).for("update").limit(1);
          if (input.id) {
            const [existing] = await tx.select({ id: customerAddresses.id })
              .from(customerAddresses)
              .where(and(eq(customerAddresses.id, input.id), eq(customerAddresses.userId, ctx.user.id)))
              .for("update").limit(1);
            if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
          }
          if (input.isDefault)
            await tx.update(customerAddresses).set({ isDefault: false })
              .where(eq(customerAddresses.userId, ctx.user.id));
          if (input.id) {
            await tx.update(customerAddresses).set(values)
              .where(and(eq(customerAddresses.id, input.id), eq(customerAddresses.userId, ctx.user.id)));
            return { id: input.id };
          }
          const result = await tx.insert(customerAddresses).values(values).returning({ insertId: customerAddresses.id });
          return { id: Number(result[0].insertId) };
        });
      }),
  }),
  customer: router({
    reviewOrder: protectedProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [order] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, input.orderId), eq(orders.customerId, ctx.user.id)))
            .for("update")
            .limit(1);
          if (!order) throw new TRPCError({ code: "NOT_FOUND" });
          if (order.status !== "delivered")
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only delivered orders can be reviewed" });
          const [existing] = await tx
            .select({ id: shopReviews.id })
            .from(shopReviews)
            .where(eq(shopReviews.orderId, order.id))
            .limit(1);
          if (existing)
            throw new TRPCError({ code: "CONFLICT", message: "This order has already been reviewed" });
          const [inserted] = await tx.insert(shopReviews).values({
            orderId: order.id,
            customerId: ctx.user.id,
            vendorId: order.vendorId,
            rating: input.rating,
            comment: input.comment?.trim() || null,
          }).returning({ insertId: shopReviews.id });
          return { reviewId: Number(inserted.insertId) };
        });
      }),
  }),
  support: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      return db
        .select({
          id: supportTickets.id,
          ticketNumber: supportTickets.ticketNumber,
          subject: supportTickets.subject,
          status: supportTickets.status,
          orderId: supportTickets.orderId,
          createdAt: supportTickets.createdAt,
          updatedAt: supportTickets.updatedAt,
        })
        .from(supportTickets)
        .where(eq(supportTickets.customerId, ctx.user.id))
        .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id));
    }),
    thread: protectedProcedure
      .input(z.object({ ticketId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const [ticket] = await db
          .select()
          .from(supportTickets)
          .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.customerId, ctx.user.id)))
          .limit(1);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        const messages = await db
          .select({
            id: supportMessages.id,
            ticketId: supportMessages.ticketId,
            senderRole: supportMessages.senderRole,
            message: supportMessages.message,
            createdAt: supportMessages.createdAt,
          })
          .from(supportMessages)
          .where(eq(supportMessages.ticketId, ticket.id))
          .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
        return { ticket, messages };
      }),
    create: protectedProcedure
      .input(z.object({
        subject: z.string().trim().min(1).max(200),
        message: z.string().trim().min(1).max(10_000),
        orderId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        if (input.orderId) {
          const [order] = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.id, input.orderId), eq(orders.customerId, ctx.user.id))).limit(1);
          if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        }
        const ticketNumber = `MTM-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        return db.transaction(async tx => {
          const [inserted] = await tx.insert(supportTickets).values({
            ticketNumber,
            customerId: ctx.user.id,
            orderId: input.orderId ?? null,
            subject: input.subject,
          }).returning({ insertId: supportTickets.id });
          const ticketId = Number(inserted.insertId);
          await tx.insert(supportMessages).values({
            ticketId,
            senderUserId: ctx.user.id,
            senderRole: "customer",
            message: input.message,
          }).returning({ insertId: supportMessages.id });
          await writeAudit(tx, ctx.user.id, "support.ticket_created", "support_ticket", ticketId, { ticketNumber });
          return { ticketId, ticketNumber };
        });
      }),
    reply: protectedProcedure
      .input(z.object({ ticketId: z.number().int().positive(), message: z.string().trim().min(1).max(10_000) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [ticket] = await tx.select().from(supportTickets)
            .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.customerId, ctx.user.id)))
            .for("update").limit(1);
          if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
          if (ticket.status !== "open" && ticket.status !== "in_progress")
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This ticket is not open for replies" });
          const [inserted] = await tx.insert(supportMessages).values({
            ticketId: ticket.id,
            senderUserId: ctx.user.id,
            senderRole: "customer",
            message: input.message,
          }).returning({ insertId: supportMessages.id });
          await tx.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
          return { messageId: Number(inserted.insertId) };
        });
      }),
  }),
  marketplace: router({
    browse: publicProcedure.input(browseInput).query(async ({ ctx, input }) => {
      requireLocalMarketplace(ctx.req);
      const db = await database();
      await refreshLinkedEligibility({
        townId: input.townId,
        zoneId: input.zoneId,
      });
      await requireActiveServiceZone(db, input.townId, input.zoneId);
      const page = await browseRows(db, input);
      const ratings = await shopRatingMap(
        db,
        page.shopRows.map(row => row.shop.id)
      );
      return {
        products: page.productRows.map(row => ({
          ...publicProduct(row.product),
          shopName: row.shopName,
        })),
        shops: page.shopRows.map(row =>
          withShopRating(
            publicShop(row.shop, row.zone, row.category, row.townName),
            ratings
          )
        ),
        nextCursor: page.nextCursor,
      };
    }),
    toggleFavorite: protectedProcedure
      .input(z.object({ shopId: z.number().int().positive(), townId: z.number().int().positive(), zoneId: z.number().int().positive(), favorited: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const [shop] = await db.select({ id: vendorProfiles.id })
          .from(vendorProfiles)
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .where(and(
            eq(vendorProfiles.id, input.shopId),
            eq(vendorProfiles.townId, input.townId),
            eq(vendorProfiles.zoneId, input.zoneId),
            eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
            eq(vendorProfiles.isOpen, true),
            eq(serviceZones.id, input.zoneId),
            eq(serviceZones.townId, input.townId),
            eq(serviceZones.active, true),
            eq(towns.id, input.townId),
            eq(towns.active, true)
          )).limit(1);
        if (!shop) throw new TRPCError({ code: "NOT_FOUND", message: "Shop is not active in your selected service area" });
        if (input.favorited) {
          await db.insert(favoriteShops).values({ userId: ctx.user.id, vendorId: shop.id })
            .onConflictDoUpdate({ target: [favoriteShops.userId, favoriteShops.vendorId],  set: { vendorId: shop.id } }).returning({ insertId: favoriteShops.id });
        } else {
          await db.delete(favoriteShops).where(and(eq(favoriteShops.userId, ctx.user.id), eq(favoriteShops.vendorId, shop.id)));
        }
        return { favorited: input.favorited };
      }),
    favoriteShops: protectedProcedure
      .input(z.object({ townId: z.number().int().positive(), zoneId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const rows = await db.select({ shop: vendorProfiles, zone: serviceZones, category: categories, townName: towns.name })
          .from(favoriteShops)
          .innerJoin(vendorProfiles, eq(favoriteShops.vendorId, vendorProfiles.id))
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(categories, eq(vendorProfiles.categoryId, categories.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .where(and(
            eq(favoriteShops.userId, ctx.user.id),
            eq(vendorProfiles.townId, input.townId),
            eq(vendorProfiles.zoneId, input.zoneId),
            eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
            eq(vendorProfiles.isOpen, true),
            eq(serviceZones.active, true),
            eq(serviceZones.townId, input.townId),
            eq(towns.active, true),
            eq(categories.enabled, true),
            eq(categories.regulated, false)
          )).orderBy(desc(favoriteShops.createdAt)).limit(100);
        if (!rows.length) return [];
        const shopIds = rows.map(row => row.shop.id);
        const aggregates = await db.select({
          vendorId: shopReviews.vendorId,
          average: sql<number>`avg(${shopReviews.rating})`,
          count: sql<number>`count(${shopReviews.id})`,
        }).from(shopReviews).where(inArray(shopReviews.vendorId, shopIds)).groupBy(shopReviews.vendorId);
        const byShop = new Map(aggregates.map(row => [row.vendorId, row]));
        return rows.map(row => {
          const aggregate = byShop.get(row.shop.id);
          return {
            ...publicShop(row.shop, row.zone, row.category, row.townName),
            ratingAverage: aggregate ? Number(aggregate.average) : null,
            ratingCount: aggregate ? Number(aggregate.count) : 0,
          };
        });
      }),
    areas: publicProcedure.query(async () => {
      const db = await database();
      const activeTowns = await db
        .select()
        .from(towns)
        .where(eq(towns.active, true))
        .orderBy(asc(towns.name));
      const activeZones = await db
        .select({ zone: serviceZones, townName: towns.name, state: towns.state })
        .from(serviceZones)
        .innerJoin(towns, eq(serviceZones.townId, towns.id))
        .where(and(eq(serviceZones.active, true), eq(towns.active, true)))
        .orderBy(asc(towns.name), asc(serviceZones.locality));
      return {
        towns: activeTowns,
        zones: activeZones.map(row => ({
          ...row.zone,
          townName: row.townName,
          state: row.state,
        })),
      };
    }),
    home: publicProcedure
      .input(
        z.object({
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const activeCategories = await db
          .select()
          .from(categories)
          .where(
            and(eq(categories.enabled, true), eq(categories.regulated, false))
          )
          .orderBy(asc(categories.sortOrder));
        const shopRows = await db
          .select({
            shop: vendorProfiles,
            zone: serviceZones,
            category: categories,
            townName: towns.name,
          })
          .from(vendorProfiles)
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(categories, eq(vendorProfiles.categoryId, categories.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .where(
            and(
              eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
              eq(vendorProfiles.isOpen, true),
              eq(serviceZones.active, true),
              eq(towns.active, true),
              eq(categories.enabled, true),
              eq(categories.regulated, false),
              eq(towns.id, input.townId),
              eq(vendorProfiles.zoneId, input.zoneId)
            )
          )
          .limit(30);
        const shopIds = shopRows.map(r => r.shop.id);
        const ratings = await shopRatingMap(db, shopIds);
        const popular = shopIds.length
          ? await db
              .select({ product: products })
              .from(products)
              .innerJoin(categories, eq(products.categoryId, categories.id))
              .where(
                and(
                  inArray(products.vendorId, shopIds),
                  eq(products.availability, "available"),
                  publishedProductCondition(products.id, products.vendorId, products.isDemo),
                  eq(categories.enabled, true),
                  eq(categories.regulated, false)
                )
              )
              .limit(30)
          : [];
        return {
          categories: activeCategories,
          shops: shopRows.map(r =>
            withShopRating(publicShop(r.shop, r.zone, r.category, r.townName), ratings)
          ),
          products: popular.map(row => publicProduct(row.product)),
        };
      }),
    search: publicProcedure
      .input(
        z.object({
          q: z.string().trim().max(160).optional(),
          categoryId: z.number().int().positive().optional(),
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const shopConditions: (ReturnType<typeof eq> | undefined)[] = [
          eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
          eq(vendorProfiles.isOpen, true),
          eq(serviceZones.active, true),
          eq(towns.active, true),
          eq(categories.enabled, true),
          eq(categories.regulated, false),
        ];
        shopConditions.push(eq(towns.id, input.townId));
        shopConditions.push(
          eq(vendorProfiles.zoneId, input.zoneId)
        );
        if (input.categoryId)
          shopConditions.push(eq(vendorProfiles.categoryId, input.categoryId));
        if (input.q)
          shopConditions.push(
            or(
              ilike(vendorProfiles.shopName, `%${input.q}%`),
              ilike(categories.name, `%${input.q}%`)
            )!
          );
        const shops = await db
          .select({
            shop: vendorProfiles,
            zone: serviceZones,
            category: categories,
            townName: towns.name,
          })
          .from(vendorProfiles)
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(categories, eq(vendorProfiles.categoryId, categories.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .where(and(...shopConditions))
          .limit(50);
        const productVendors = await db
          .select({ id: vendorProfiles.id,shopName:vendorProfiles.shopName })
          .from(vendorProfiles)
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(categories, eq(vendorProfiles.categoryId, categories.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
      .where(
        and(
          eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
          eq(vendorProfiles.isOpen, true),
          eq(serviceZones.active, true),
          eq(towns.active, true),
          eq(categories.enabled, true),
          eq(categories.regulated, false),
          eq(towns.id, input.townId),
          eq(vendorProfiles.zoneId, input.zoneId)
            )
          );
        const vendorIds = productVendors.map(x => x.id);
        const productConds: (ReturnType<typeof eq> | undefined)[] = [
          eq(products.availability, "available"),
                  publishedProductCondition(products.id, products.vendorId, products.isDemo),
          eq(categories.enabled, true),
          eq(categories.regulated, false),
          ...(vendorIds.length
            ? [inArray(products.vendorId, vendorIds)]
            : [eq(products.id, -1)]),
        ];
        if (input.categoryId)
          productConds.push(eq(products.categoryId, input.categoryId));
        if (input.q)
          productConds.push(
            or(
              ilike(products.name, `%${input.q}%`),
              ilike(products.description, `%${input.q}%`)
            )!
          );
        const foundProducts = await db
          .select({ product: products })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(and(...productConds))
          .limit(100);
        const ratings = await shopRatingMap(db, shops.map(row => row.shop.id));
        return {
          shops: shops.map(x =>
            withShopRating(publicShop(x.shop, x.zone, x.category, x.townName), ratings)
          ),
          products: foundProducts.map(row => ({...publicProduct(row.product),shopName:productVendors.find(v=>v.id===row.product.vendorId)?.shopName})),
        };
      }),
    shop: publicProcedure
      .input(
        z.object({
          shopId: z.number().int().positive(),
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const [shop] = await db
          .select({
            shop: vendorProfiles,
            zone: serviceZones,
            townName: towns.name,
            category: categories,
          })
          .from(vendorProfiles)
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .innerJoin(categories, eq(vendorProfiles.categoryId, categories.id))
          .where(
            and(
              eq(vendorProfiles.id, input.shopId),
              eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
              eq(serviceZones.active, true),
              eq(towns.active, true),
              eq(categories.enabled, true),
              eq(categories.regulated, false),
              eq(towns.id, input.townId),
              eq(vendorProfiles.zoneId, input.zoneId)
            )
          )
          .limit(1);
        if (!shop) throw new TRPCError({ code: "NOT_FOUND" });
        const items = await db
          .select({ product: products })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .where(
            and(
              eq(products.vendorId, input.shopId),
              eq(products.availability, "available"),
                  publishedProductCondition(products.id, products.vendorId, products.isDemo),
              eq(categories.enabled, true),
              eq(categories.regulated, false)
            )
          ).orderBy(asc(products.id)).limit(24);
        const ratings = await shopRatingMap(db, [shop.shop.id]);
        return {
          ...withShopRating(publicShop(shop.shop, shop.zone, shop.category, shop.townName), ratings),
          products: items.map(row => publicProduct(row.product)),
        };
      }),
    product: publicProcedure
      .input(
        z.object({
          productId: z.number().int().positive(),
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ townId: input.townId, zoneId: input.zoneId });
        await requireActiveServiceZone(db, input.townId, input.zoneId);
        const [p] = await db
          .select({
            product: products,
            shop: vendorProfiles,
            zone: serviceZones,
            category: categories,
            town: towns,
          })
          .from(products)
          .innerJoin(vendorProfiles, eq(products.vendorId, vendorProfiles.id))
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .innerJoin(shopCategories, eq(vendorProfiles.categoryId, shopCategories.id))
          .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
          .where(
            and(
              eq(products.id, input.productId),
              eq(products.availability, "available"),
                  publishedProductCondition(products.id, products.vendorId, products.isDemo),
              eq(vendorProfiles.status, "approved"),
            publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
              eq(serviceZones.active, true),
              eq(towns.active, true),
              eq(categories.enabled, true),
              eq(categories.regulated, false),
              eq(shopCategories.enabled, true),
              eq(shopCategories.regulated, false),
              eq(towns.id, input.townId),
              eq(vendorProfiles.zoneId, input.zoneId)
            )
          )
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...publicProduct(p.product),
          shop: {
            id: p.shop.id,
            name: p.shop.shopName,
            locality: p.zone.locality,
            town: p.town.name,
            isOpen: p.shop.isOpen,
            deliveryEnabled: p.shop.deliveryEnabled,
            pickupEnabled: p.shop.pickupEnabled,
            deliveryFeePaise: p.shop.deliveryFeePaise,
            platformFeePaise: p.shop.platformFeePaise,
            minimumOrderPaise: p.shop.minimumOrderPaise,
            preparationMinutes: p.shop.preparationMinutes,
          },
        };
      }),
    quoteOrder: protectedProcedure
      .input(checkoutInput)
      .query(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        await refreshLinkedEligibility({ vendorId: input.shopId });
        return db.transaction(async tx => (await prepareCheckout(tx, input, ctx.user)).quote);
      }),
    placeOrder: protectedProcedure
      .input(checkoutInput.extend({
        idempotencyKey: z.string().trim().min(8).max(96),
        quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        requireLocalMarketplace(ctx.req);
        const db = await database();
        const [prior] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.customerId, ctx.user.id),
              eq(orders.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (prior) return duplicateCheckout(db, prior, input, ctx.user.id);
        await refreshLinkedEligibility({ vendorId: input.shopId });
        const apnaHold = await reserveForCheckout(db, input, ctx.user);
        try {
          return await db.transaction(async tx => {
            // Serialize this customer's retries before stock checks, including last-unit retries.
            await tx.select({ id: users.id }).from(users)
              .where(eq(users.id, ctx.user.id)).for("update");
            // The customer lock serializes retries; locking a missing order key can deadlock on index gaps.
            const [existing] = await tx.select().from(orders)
              .where(and(eq(orders.customerId, ctx.user.id), eq(orders.idempotencyKey, input.idempotencyKey)))
              .limit(1);
            if (existing) return duplicateCheckout(tx, existing, input, ctx.user.id);
            const { shop, items, totals, zoneId, addressSnapshot, custName, custPhone, quote } =
              await prepareCheckout(tx, input, ctx.user, await trustedCheckoutStock(tx,input,ctx.user.id));
            if (input.quoteFingerprint !== quote.quoteFingerprint)
              throw new TRPCError({
                code: "CONFLICT",
                message: "Your cart changed or has not been confirmed. Review the current items, address and total, then confirm again.",
              });
            for (const item of items)
              await tx
                .update(products)
                .set({
                  stockQuantity: item.product.stockQuantity - item.quantity,
                })
                .where(
                  and(
                    eq(products.id, item.product.id),
                    sql`${products.stockQuantity} >= ${item.quantity}`
                  )
                );
            const orderNumber = `MTM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
            const result = await tx
              .insert(orders)
              .values({
                orderNumber,
                customerId: ctx.user.id,
                vendorId: shop.id,
                townId: shop.townId,
                zoneId,
                idempotencyKey: input.idempotencyKey,
                status: "placed",
                fulfillmentType: input.fulfillmentType,
                paymentMethod: input.paymentMethod,
                subtotalPaise: totals.subtotalPaise,
                discountPaise: 0,
                deliveryFeePaise: totals.deliveryFeePaise,
                platformFeePaise: totals.platformFeePaise,
                taxPaise: totals.taxPaise,
                totalPaise: totals.totalPaise,
                commissionPaise: totals.commissionPaise,
                notes: input.notes ?? null,
                substitutionPreference: input.substitutionPreference ?? null,
                addressSnapshot,
                customerNameSnapshot: custName,
                customerPhoneSnapshot: custPhone,
              }).returning({ insertId: orders.id });
            const orderId = Number(result[0].insertId);
            await tx
              .insert(orderItems)
              .values(
                items.map(i => ({
                  orderId,
                  productId: i.product.id,
                  productNameSnapshot: i.product.name,
                  unitSnapshot: i.product.unit,
                  quantity: i.quantity,
                  unitPricePaise: i.product.pricePaise,
                  lineTotalPaise: i.lineTotalPaise,
                  taxSnapshot: i.taxSnapshot,
                }))
              ).returning({ insertId: orderItems.id });
            await tx
              .insert(orderEvents)
              .values({
                orderId,
                actorUserId: ctx.user.id,
                actorRole: "customer",
                fromStatus: null,
                toStatus: "placed",
                note: null,
                metadata: { checkoutRequestV1: requestFingerprint(input, ctx.user.id), quoteFingerprint: quote.quoteFingerprint },
              }).returning({ insertId: orderEvents.id });
            await tx
              .insert(paymentRecords)
              .values({
                orderId,
                method: input.paymentMethod,
                status: "pending",
                amountPaise: totals.totalPaise,
              }).returning({ insertId: paymentRecords.id });
            await tx
              .insert(financialLedger)
              .values(
                makeOrderLedgerEntries({
                  orderId,
                  vendorId: shop.id,
                  subtotalPaise: totals.subtotalPaise,
                  commissionPaise: totals.commissionPaise,
                  deliveryFeePaise: totals.deliveryFeePaise,
                  platformFeePaise: totals.platformFeePaise,
                })
              ).returning({ insertId: financialLedger.id });
            await attachCheckout(tx, apnaHold, orderId, orderNumber);
            return { orderId, orderNumber, duplicate: false, totals };
          });
        } catch (error) {
          let mysqlCode: unknown = undefined;
          let cause: unknown = error;
          for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
            const current = cause as { code?: unknown; cause?: unknown };
            mysqlCode ??= current.code;
            if (current.code === "23505") break;
            cause = current.cause;
          }
          if (mysqlCode === "23505" || (cause as { code?: unknown } | null)?.code === "23505") {
            const [same] = await db
              .select()
              .from(orders)
              .where(
                and(
                  eq(orders.customerId, ctx.user.id),
                  eq(orders.idempotencyKey, input.idempotencyKey)
                )
              )
              .limit(1);
            if (same) return duplicateCheckout(db, same, input, ctx.user.id);
          }
          throw error;
        }
      }),
    checkoutSubmission: protectedProcedure
      .input(z.object({ key: z.string().min(8).max(100) }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const [row] = await db.select({ id: orders.id }).from(orders)
          .where(and(eq(orders.customerId, ctx.user.id), eq(orders.idempotencyKey, input.key))).limit(1);
        return row ?? null;
      }),
    orderHistory: protectedProcedure
      .input(z.object({ cursor: z.number().int().positive().nullish(), limit: z.number().int().min(1).max(50).default(20) }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const rows = await db.select({ order: orders, shopName: vendorProfiles.shopName })
          .from(orders).innerJoin(vendorProfiles, eq(orders.vendorId, vendorProfiles.id))
          .where(and(eq(orders.customerId, ctx.user.id), input.cursor ? sql`${orders.id}<${input.cursor}` : undefined))
          .orderBy(desc(orders.id)).limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        return { orders: page, nextCursor: rows.length > input.limit ? page.at(-1)!.order.id : null };
      }),
    myOrders: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      return db
        .select({ order: orders, shopName: vendorProfiles.shopName })
        .from(orders)
        .innerJoin(vendorProfiles, eq(orders.vendorId, vendorProfiles.id))
        .where(eq(orders.customerId, ctx.user.id))
        .orderBy(desc(orders.createdAt)).limit(100);
    }),
    orderDetail: protectedProcedure
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const [row] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.customerId, ctx.user.id)
            )
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const [review] = await db.select({
          id: shopReviews.id,
          rating: shopReviews.rating,
          comment: shopReviews.comment,
          createdAt: shopReviews.createdAt,
        }).from(shopReviews).where(eq(shopReviews.orderId, row.id)).limit(1);
        return {
          order: row,
          apnaSync: await orderSyncStatus(db,row.id),
          review: review ?? null,
          handoverCode:
            !row.handoverLockedAt && (
              (row.fulfillmentType === "pickup" && row.status === "ready") ||
              (row.fulfillmentType === "delivery" && row.status === "out_for_delivery")
            )
              ? deriveHandoverCode(row.id)
              : null,
          items: await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, row.id)),
          timeline: await db
            .select()
            .from(orderEvents)
            .where(eq(orderEvents.orderId, row.id))
            .orderBy(asc(orderEvents.createdAt)),
        };
      }),
    cancelOrder: protectedProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          reason: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.id, input.orderId),
                eq(orders.customerId, ctx.user.id)
              )
            )
            .for("update")
            .limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND" });
          assertOrderTransition("customer", o.status, "cancelled");
          await voidUncollectedOrder(tx, o, input.reason?.trim() || "Customer cancelled");
          const restored = o.stockRestoredAt !== null;
          const lines = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, o.id));
          if (!restored)
            for (const line of lines)
              if (line.productId)
                await tx
                  .update(products)
                  .set({
                    stockQuantity: sql`${products.stockQuantity} + ${line.quantity}`,
                  })
                  .where(eq(products.id, line.productId));
          await tx
            .update(orders)
            .set({
              status: "cancelled",
              cancelReason: input.reason ?? null,
              stockRestoredAt: new Date(),
            })
            .where(eq(orders.id, o.id));
          await tx
            .update(deliveryAssignments)
            .set({ status: "failed", deliveryProof: "Order cancelled by customer" })
            .where(
              and(
                eq(deliveryAssignments.orderId, o.id),
                inArray(deliveryAssignments.status, ["assigned", "accepted", "arrived"])
              )
            );
          await tx
            .insert(orderEvents)
            .values({
              orderId: o.id,
              actorUserId: ctx.user.id,
              actorRole: "customer",
              fromStatus: o.status,
              toStatus: "cancelled",
              note: input.reason ?? null,
            }).returning({ insertId: orderEvents.id });
          return { success: true };
        });
      }),
  }),
  vendor: router({
    status: apnaVendorProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [v] = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.userId, ctx.user.id))
        .limit(1);
      return v ?? null;
    }),
    setOpen: apnaVendorProcedure
      .input(z.object({ isOpen: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const vendor = await vendorFor(ctx.user.id);
        await db
          .update(vendorProfiles)
          .set({ isOpen: input.isOpen })
          .where(eq(vendorProfiles.id, vendor.id));
        return { success: true };
      }),
    updateDeliverySettings: apnaVendorProcedure
      .input(
        z
          .object({
            deliveryEnabled: z.boolean().optional(),
            pickupEnabled: z.boolean().optional(),
            deliveryFeePaise: z.number().int().min(0).max(50_000).optional(),
            minimumOrderPaise: z
              .number()
              .int()
              .min(0)
              .max(100_000_000)
              .optional(),
            preparationMinutes: z.number().int().min(5).max(240).optional(),
            openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
            closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
          })
          .refine(value => Object.keys(value).length > 0, "No settings were provided")
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const vendor = await vendorFor(ctx.user.id);
        const { openingTime, closingTime, ...updates } = input;
        const settingPatch = {
          ...(openingTime !== undefined ? { openingTime } : {}),
          ...(closingTime !== undefined ? { closingTime } : {}),
        };
        const settings = { ...(vendor.settings ?? {}), ...settingPatch };
        if(!validShopHours(settings))throw new TRPCError({code:'BAD_REQUEST',message:'Set both opening and closing times; use manual hours for an all-day shop'});
        await db
          .update(vendorProfiles)
          .set({
            ...updates,
            ...(Object.keys(settingPatch).length ? { settings } : {}),
          })
          .where(eq(vendorProfiles.id, vendor.id));
        await audit(ctx.user.id, "vendor.delivery_settings", "vendor", vendor.id);
        return { success: true };
      }),
    register: apnaVendorProcedure
      .input(
        z.object({
          townId: z.number().int().positive(),
          zoneId: z.number().int().positive(),
          categoryId: z.number().int().positive(),
          shopName: z.string().trim().min(2).max(180),
          address: z.string().trim().min(2).max(1000),
          description: z.string().max(3000).optional(),
          phone: z.string().trim().min(5).max(30).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [owner] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, ctx.user.id))
            .for("update")
            .limit(1);
          if (!owner) throw new TRPCError({ code: "UNAUTHORIZED" });
          const existing = await tx
            .select()
            .from(vendorProfiles)
            .where(eq(vendorProfiles.userId, ctx.user.id))
            .for("update");
          if (existing.length) return { id: existing[0].id, status: existing[0].status };
          const [zone] = await tx
            .select()
            .from(serviceZones)
            .where(
              and(
                eq(serviceZones.id, input.zoneId),
                eq(serviceZones.townId, input.townId),
                eq(serviceZones.active, true)
              )
            )
            .limit(1);
          const [activeTown] = await tx
            .select({ id: towns.id })
            .from(towns)
            .where(and(eq(towns.id, input.townId), eq(towns.active, true)))
            .limit(1);
          const [cat] = await tx
            .select()
            .from(categories)
            .where(
              and(
                eq(categories.id, input.categoryId),
                eq(categories.enabled, true),
                eq(categories.regulated, false)
              )
            )
            .limit(1);
          if (!zone || !cat || !activeTown)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active service zone and enabled category" });
          const slug = `${input.shopName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 92)}-${crypto.randomUUID().slice(0, 8)}`;
          const result = await tx.insert(vendorProfiles).values({
            userId: ctx.user.id,
            ...input,
            slug,
            description: input.description ?? null,
            phone: input.phone ?? null,
            status: "pending",
            isOpen: false,
          }).returning({ insertId: vendorProfiles.id });
          const id = Number(result[0].insertId);
          await writeAudit(tx, ctx.user.id, "vendor.register", "vendor", id);
          return { id, status: "pending" as const };
        });
      }),
    dashboard: apnaVendorProcedure.query(async ({ ctx }) => {
      const db = await database();
      const v = await vendorFor(ctx.user.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const shopOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.vendorId, v.id));
      const listed = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.vendorId, v.id),
            eq(products.availability, "available")
          )
        );
      return {
        vendor: v,
        ordersToday: shopOrders.filter(x => x.createdAt >= today).length,
        pendingOrders: shopOrders.filter(x =>
          ["placed", "accepted", "preparing"].includes(x.status)
        ).length,
        completedOrders: shopOrders.filter(x => x.status === "delivered")
          .length,
        salesTodayPaise: shopOrders
          .filter(x => x.createdAt >= today && x.status === "delivered")
          .reduce((n, x) => n + x.subtotalPaise, 0),
        productsListed: listed.length,
        lowStockProducts: listed.filter(p => p.stockQuantity <= 5).length,
      };
    }),
    products: apnaVendorProcedure.query(async ({ ctx }) => {
      const db = await database();
      const v = await vendorFor(ctx.user.id);
      return db
        .select()
        .from(products)
        .where(eq(products.vendorId, v.id))
        .orderBy(asc(products.name));
    }),
    createProduct: apnaVendorProcedure
      .input(productInput)
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        const [cat] = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, input.categoryId),
              eq(categories.enabled, true),
              eq(categories.regulated, false)
            )
          )
          .limit(1);
        if (!cat)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid product category",
          });
        if (input.mrpPaise !== undefined && input.mrpPaise < input.pricePaise)
          throw new TRPCError({ code: "BAD_REQUEST", message: "MRP cannot be below the selling price" });
        const slug = `${input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 130)}-${crypto.randomUUID().slice(0, 8)}`;
        const res = await db
          .insert(products)
          .values({
            ...input,
            vendorId: v.id,
            slug,
            isDemo: v.isDemo,
            description: input.description ?? null,
            mrpPaise: input.mrpPaise ?? null,
            imageUrl: null,
            availability: input.availability ?? "available",
          }).returning({ insertId: products.id });
        return { id: Number(res[0].insertId) };
      }),
    uploadProductImage: apnaVendorProcedure
      .input(imageUploadInput.extend({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const vendor = await vendorFor(ctx.user.id);
        const [product] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, input.productId), eq(products.vendorId, vendor.id)))
          .limit(1);
        if (!product) throw new TRPCError({ code: "NOT_FOUND" });
        const bytes = decodeImageUpload(input.contentType, input.dataBase64);
        let imageUrl: string;
        try {
          imageUrl = (await storagePut(`marketplace/vendors/${vendor.id}/products/${product.id}`, bytes, input.contentType)).url;
        } catch {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Image storage is not available; the product was saved without an uploaded photo" });
        }
        await db.update(products).set({ imageUrl }).where(and(eq(products.id, product.id), eq(products.vendorId, vendor.id)));
        await audit(ctx.user.id, "product.image_upload", "product", product.id, { contentType: input.contentType, byteLength: bytes.length });
        return { imageUrl };
      }),
    uploadStoreImage: apnaVendorProcedure
      .input(imageUploadInput.extend({ imageType: z.enum(["logo", "cover"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const vendor = await vendorFor(ctx.user.id, false);
        if (!["pending", "approved"].includes(vendor.status))
          throw new TRPCError({ code: "FORBIDDEN", message: "Only pending or approved vendors may upload storefront images" });
        const bytes = decodeImageUpload(input.contentType, input.dataBase64);
        let imageUrl: string;
        try {
          imageUrl = (await storagePut(`marketplace/vendors/${vendor.id}/${input.imageType}`, bytes, input.contentType)).url;
        } catch {
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Image storage is not available" });
        }
        await db.update(vendorProfiles).set(input.imageType === "logo" ? { logoUrl: imageUrl } : { coverUrl: imageUrl }).where(and(eq(vendorProfiles.id, vendor.id), eq(vendorProfiles.userId, ctx.user.id)));
        await audit(ctx.user.id, `vendor.${input.imageType}_upload`, "vendor", vendor.id, { contentType: input.contentType, byteLength: bytes.length });
        return { imageUrl };
      }),
    updateProduct: apnaVendorProcedure
      .input(
        z.object({
          productId: z.number().int().positive(),
          patch: productInput.partial(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        const [p] = await db
          .select()
          .from(products)
          .where(
            and(eq(products.id, input.productId), eq(products.vendorId, v.id))
          )
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.patch.categoryId !== undefined) {
          const [category] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.id, input.patch.categoryId),
                eq(categories.enabled, true),
                eq(categories.regulated, false)
              )
            )
            .limit(1);
          if (!category)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Product category must be enabled and non-regulated" });
        }
        const nextPrice = input.patch.pricePaise ?? p.pricePaise;
        if (input.patch.mrpPaise !== undefined && input.patch.mrpPaise < nextPrice)
          throw new TRPCError({ code: "BAD_REQUEST", message: "MRP cannot be below the selling price" });
        await db.update(products).set(input.patch).where(eq(products.id, p.id));
        return { success: true };
      }),
    archiveProduct: apnaVendorProcedure
      .input(z.object({ productId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        const result = await db
          .update(products)
          .set({ availability: "archived" })
          .where(
            and(eq(products.id, input.productId), eq(products.vendorId, v.id))
          );
        return { success: true, result };
      }),
    orders: apnaVendorProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        return db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.vendorId, v.id),
              ...(input?.status
                ? [eq(orders.status, input.status as OrderStatus)]
                : [])
            )
          )
          .orderBy(desc(orders.createdAt));
      }),
    orderDetail: apnaVendorProcedure
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const vendor = await vendorFor(ctx.user.id);
        const [order] = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.vendorId, vendor.id)
            )
          )
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          order,
          apnaSync: await orderSyncStatus(db, order.id),
          customer: {
            name: order.customerNameSnapshot,
            phone: order.customerPhoneSnapshot,
            address: order.addressSnapshot,
          },
          items: await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id)),
          timeline: await db
            .select()
            .from(orderEvents)
            .where(eq(orderEvents.orderId, order.id))
            .orderBy(asc(orderEvents.createdAt)),
        };
      }),
    updateOrderStatus: apnaVendorProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          status: z.enum([
            "accepted",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
            "failed_delivery",
            "rejected",
          ]),
          reason: z.string().trim().max(1000).optional(),
          substitutionsApproved: z.boolean().optional(),
          handoverCode: z.string().regex(/^\d{8}$/).optional(),
          cashAmountPaise: z.number().int().min(0).max(2_147_483_647).optional(),
          cashNote: z.string().trim().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        const result = await db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, input.orderId), eq(orders.vendorId, v.id)))
            .for("update")
            .limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND" });
          assertOrderTransition("vendor", o.status, input.status, o.fulfillmentType);
          if ((input.status === "rejected" || input.status === "failed_delivery") && !input.reason)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${input.status === "rejected" ? "Rejection" : "Failure"} reason is required`,
            });
          if (input.substitutionsApproved !== undefined)
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Substitutions are unavailable until a customer approval is recorded" });
          if (
            input.status === "out_for_delivery" ||
            input.status === "delivered" ||
            input.status === "failed_delivery"
          ) {
            if (o.fulfillmentType === "delivery") {
              const [activeAssignment] = await tx
                .select({ id: deliveryAssignments.id, status: deliveryAssignments.status })
                .from(deliveryAssignments)
                .where(
                  and(
                    eq(deliveryAssignments.orderId, o.id),
                    inArray(deliveryAssignments.status, [
                      "assigned",
                      "accepted",
                      "arrived",
                      "picked_up",
                    ])
                  )
                )
                .limit(1);
              assertNoActiveRiderAssignment(activeAssignment, input.status);
            }
          }
          if (input.status === "delivered") {
            if (o.fulfillmentType !== "pickup" && o.fulfillmentType !== "delivery")
              throw new TRPCError({ code: "FORBIDDEN", message: "Only pickup and seller-managed delivery orders can be handed over by the vendor" });
            if (!input.handoverCode || input.cashAmountPaise === undefined)
              throw new TRPCError({ code: "BAD_REQUEST", message: "Customer handover code and actual cash amount are required" });
            if (o.handoverLockedAt)
              return { handoverError: "locked" as const };
            if (!verifyHandoverCode(o.id, input.handoverCode))
              return { handoverError: await recordHandoverFailure(tx, o, ctx.user.id, "vendor") };
          } else if (input.handoverCode || input.cashAmountPaise !== undefined || input.cashNote) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Handover and cash details apply only when completing an order" });
          }
          if (input.status === "rejected") {
            await voidUncollectedOrder(tx, o, input.reason ?? "Vendor rejected");
            const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
            if (!o.stockRestoredAt)
              for (const line of lines)
                if (line.productId)
                  await tx.update(products).set({
                    stockQuantity: sql`${products.stockQuantity} + ${line.quantity}`,
                  }).where(eq(products.id, line.productId));
            await tx.update(orders).set({
              status: input.status,
              cancelReason: input.reason,
              stockRestoredAt: new Date(),
            }).where(eq(orders.id, o.id));
            await tx.update(deliveryAssignments)
              .set({ status: "failed", deliveryProof: "Order rejected by vendor" })
              .where(and(
                eq(deliveryAssignments.orderId, o.id),
                inArray(deliveryAssignments.status, ["assigned", "accepted", "arrived"])
              ));
          } else if (input.status === "failed_delivery") {
            return await executeFailedDeliveryTransition(tx, {
              order: o,
              actorUserId: ctx.user.id,
              actorRole: "vendor",
              reason: input.reason!,
            });
          } else {
            await tx.update(orders).set({ status: input.status }).where(eq(orders.id, o.id));
          }
          await tx.insert(orderEvents).values({
            orderId: o.id,
            actorUserId: ctx.user.id,
            actorRole: "vendor",
            fromStatus: o.status,
            toStatus: input.status,
            note: input.reason ?? null,
          }).returning({ insertId: orderEvents.id });
          const cash = input.status === "delivered"
            ? await recordCashCollection(tx, o, ctx.user.id, "vendor", input.cashAmountPaise!, input.cashNote)
            : null;
          return { success: true as const, ...(cash ?? {}) };
        });
        if ("handoverError" in result)
          throw new TRPCError({
            code: result.handoverError === "locked" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
            message: result.handoverError === "locked"
              ? "Handover attempts are locked. Ask an administrator to verify the customer and reset the code attempts."
              : "The customer handover code is invalid",
          });
        return result;
      }),
    recordReturnRecovery: apnaVendorProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          inspectionNotes: z.string().trim().min(3).max(1000),
          items: z.array(returnRecoveryItemSchema).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const v = await vendorFor(ctx.user.id);
        return db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, input.orderId), eq(orders.vendorId, v.id)))
            .for("update")
            .limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
          return executeReturnRecovery(tx, {
            order: o,
            actorUserId: ctx.user.id,
            actorRole: "vendor",
            inspectionNotes: input.inspectionNotes,
            items: input.items,
          });
        });
      }),
  }),
  rider: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [r] = await db
        .select()
        .from(riderProfiles)
        .where(eq(riderProfiles.userId, ctx.user.id))
        .limit(1);
      return r ?? null;
    }),
    register: protectedProcedure
      .input(
        z.object({
          townId: z.number().int().positive(),
          phone: z.string().trim().min(5).max(30),
          vehicleType: z.string().max(60).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [existing] = await db
          .select()
          .from(riderProfiles)
          .where(eq(riderProfiles.userId, ctx.user.id))
          .limit(1);
        if (existing) return { id: existing.id, status: existing.status };
        const [town] = await db
          .select()
          .from(towns)
          .where(and(eq(towns.id, input.townId), eq(towns.active, true)))
          .limit(1);
        if (!town)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Town is not active",
          });
        const res = await db
          .insert(riderProfiles)
          .values({
            ...input,
            vehicleType: input.vehicleType ?? null,
            userId: ctx.user.id,
            status: "pending",
            available: false,
          }).returning({ insertId: riderProfiles.id });
        return { id: Number(res[0].insertId), status: "pending" as const };
      }),
    deliveries: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const rider = await riderFor(ctx.user.id);
      const active = await db
        .select({
          assignment: {
            id: deliveryAssignments.id,
            status: deliveryAssignments.status,
            createdAt: deliveryAssignments.createdAt,
          },
          order: {
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            fulfillmentType: orders.fulfillmentType,
            paymentMethod: orders.paymentMethod,
            paymentStatus: orders.paymentStatus,
            totalPaise: orders.totalPaise,
            notes: orders.notes,
          },
          shop: {
            name: vendorProfiles.shopName,
            phone: vendorProfiles.phone,
            address: vendorProfiles.address,
            locality: serviceZones.locality,
            town: towns.name,
          },
          customer: {
            name: orders.customerNameSnapshot,
            phone: orders.customerPhoneSnapshot,
            address: orders.addressSnapshot,
          },
        })
        .from(deliveryAssignments)
        .innerJoin(orders, eq(deliveryAssignments.orderId, orders.id))
        .innerJoin(vendorProfiles, eq(orders.vendorId, vendorProfiles.id))
        .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
        .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
        .where(
          and(
            eq(deliveryAssignments.riderId, rider.id),
            inArray(deliveryAssignments.status, [
              "assigned",
              "accepted",
              "arrived",
              "picked_up",
            ]),
            inArray(orders.status, [
              "accepted",
              "preparing",
              "ready",
              "out_for_delivery",
            ])
          )
        );
      const history = await db
        .select({
          assignment: {
            id: deliveryAssignments.id,
            status: deliveryAssignments.status,
            createdAt: deliveryAssignments.createdAt,
          },
          order: {
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            fulfillmentType: orders.fulfillmentType,
            paymentMethod: orders.paymentMethod,
            paymentStatus: orders.paymentStatus,
            totalPaise: orders.totalPaise,
            notes: sql<string | null>`NULL`,
          },
        })
        .from(deliveryAssignments)
        .innerJoin(orders, eq(deliveryAssignments.orderId, orders.id))
        .where(
          and(
            eq(deliveryAssignments.riderId, rider.id),
            or(
              inArray(deliveryAssignments.status, [
                "declined",
                "delivered",
                "failed",
              ]),
              inArray(orders.status, [
                "cancelled",
                "rejected",
                "failed_delivery",
                "delivered",
              ])
            )
          )
        );
      return [
        ...active.map(row => ({ ...row, active: true as const })),
        ...history.map(row => ({
          ...row,
          shop: null,
          customer: null,
          active: false as const,
        })),
      ].sort(
        (a, b) =>
          new Date(b.assignment.createdAt).getTime() -
          new Date(a.assignment.createdAt).getTime()
      );
    }),
    setAvailability: protectedProcedure
      .input(z.object({ available: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const rider = await riderFor(ctx.user.id);
        await db
          .update(riderProfiles)
          .set({ available: input.available })
          .where(eq(riderProfiles.id, rider.id));
        return { success: true };
      }),
    updateDelivery: protectedProcedure
      .input(
        z.object({
          assignmentId: z.number().int().positive(),
          action: z.enum(["accept", "decline", "arrived", "picked_up", "delivered", "failed"]),
          proof: z.string().trim().max(1000).optional(),
          handoverCode: z.string().regex(/^\d{8}$/).optional(),
          cashAmountPaise: z.number().int().min(0).max(2_147_483_647).optional(),
          cashNote: z.string().trim().max(120).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const rider = await riderFor(ctx.user.id);
        const result = await db.transaction(async tx => {
          const [ref] = await tx
            .select({ id: deliveryAssignments.id, orderId: deliveryAssignments.orderId })
            .from(deliveryAssignments)
            .where(and(eq(deliveryAssignments.id, input.assignmentId), eq(deliveryAssignments.riderId, rider.id)))
            .limit(1);
          if (!ref) throw new TRPCError({ code: "NOT_FOUND" });
          const [o] = await tx.select().from(orders).where(eq(orders.id, ref.orderId)).for("update").limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Assigned order no longer exists" });
          const [a] = await tx
            .select()
            .from(deliveryAssignments)
            .where(and(eq(deliveryAssignments.id, ref.id), eq(deliveryAssignments.riderId, rider.id)))
            .for("update")
            .limit(1);
          if (!a || a.orderId !== o.id) throw new TRPCError({ code: "NOT_FOUND" });
          const map = {
            accept: ["assigned", "accepted"],
            decline: ["assigned", "declined"],
            arrived: ["accepted", "arrived"],
            picked_up: ["arrived", "picked_up"],
            delivered: ["picked_up", "delivered"],
            failed: ["picked_up", "failed"],
          } as const;
          const [from, to] = map[input.action];
          if (a.status !== from)
            throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot ${input.action} an assignment in ${a.status}` });
          if (["arrived", "picked_up", "failed"].includes(input.action) && !input.proof)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide an event note" });
          if (input.action === "delivered" && (!input.handoverCode || input.cashAmountPaise === undefined))
            throw new TRPCError({ code: "BAD_REQUEST", message: "Customer handover code and actual COD amount are required" });
          if (input.action !== "delivered" && (input.handoverCode || input.cashAmountPaise !== undefined || input.cashNote))
            throw new TRPCError({ code: "BAD_REQUEST", message: "Handover and cash fields apply only to delivery completion" });
          if (input.action === "delivered") {
            if (o.fulfillmentType !== "delivery" || o.paymentMethod !== "cod")
              throw new TRPCError({ code: "FORBIDDEN", message: "Rider handover applies only to cash-on-delivery orders" });
            if (o.handoverLockedAt)
              return { handoverError: "locked" as const };
            if (!verifyHandoverCode(o.id, input.handoverCode!))
              return { handoverError: await recordHandoverFailure(tx, o, ctx.user.id, "rider") };
          }
          if (input.action === "failed") {
            assertOrderTransition("rider", o.status, "failed_delivery");
            return await executeFailedDeliveryTransition(tx, {
              order: o,
              actorUserId: ctx.user.id,
              actorRole: "rider",
              reason: input.proof!,
              assignmentId: a.id,
            });
          }
          let cash: Awaited<ReturnType<typeof recordCashCollection>> | null = null;
          if (["picked_up", "delivered"].includes(input.action)) {
            const next: OrderStatus = input.action === "picked_up"
              ? "out_for_delivery"
              : "delivered";
            assertOrderTransition("rider", o.status, next);
            await tx.update(orders).set({ status: next }).where(eq(orders.id, o.id));
            await tx.insert(orderEvents).values({
              orderId: o.id,
              actorUserId: ctx.user.id,
              actorRole: "rider",
              fromStatus: o.status,
              toStatus: next,
              note: input.action === "delivered" ? "Customer handover code verified" : input.proof ?? null,
            }).returning({ insertId: orderEvents.id });
            if (input.action === "delivered")
              cash = await recordCashCollection(tx, o, ctx.user.id, "rider", input.cashAmountPaise!, input.cashNote);
          }
          await tx.update(deliveryAssignments).set({
            status: to,
            ...(input.action === "arrived" ? { arrivalNote: input.proof } : {}),
            ...(input.action === "picked_up" ? { pickupProof: input.proof } : {}),
            ...(input.action === "delivered"
              ? { deliveryProof: "In-app handover code verified" }
              : {}),
            updatedAt: new Date(),
          }).where(eq(deliveryAssignments.id, a.id));
          return { success: true as const, ...(cash ?? {}) };
        });
        if ("handoverError" in result)
          throw new TRPCError({
            code: result.handoverError === "locked" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST",
            message: result.handoverError === "locked"
              ? "Handover attempts are locked. Ask an administrator to verify the customer and reset the code attempts."
              : "The customer handover code is invalid",
          });
        return result;
      }),
  }),
  admin: router({
    dashboard: adminProcedure.query(async () => {
      const db = await database();
      const [allOrders, vendors, riders] = await Promise.all([
        db.select().from(orders),
        db.select().from(vendorProfiles),
        db.select().from(riderProfiles),
      ]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        customers: (await db.select().from(customerProfiles)).length,
        activeVendors: vendors.filter(v => v.status === "approved").length,
        pendingVendors: vendors.filter(v => v.status === "pending").length,
        ordersToday: allOrders.filter(o => o.createdAt >= today).length,
        gmvPaise: allOrders
          .filter(o => o.status === "delivered")
          .reduce((n, o) => n + o.subtotalPaise, 0),
        commissionPaise: allOrders
          .filter(o => o.status === "delivered")
          .reduce((n, o) => n + o.commissionPaise, 0),
        pendingDeliveries: allOrders.filter(o =>
          ["ready", "out_for_delivery"].includes(o.status)
        ).length,
        cancellations: allOrders.filter(o => o.status === "cancelled").length,
        pendingRiders: riders.filter(r => r.status === "pending").length,
      };
    }),
    vendors: adminProcedure
      .input(
        z
          .object({
            status: z
              .enum(["pending", "approved", "rejected", "suspended"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const db = await database();
        return db
          .select({
            vendor: vendorProfiles,
            ownerName: users.name,
            ownerEmail: users.email,
            locality: serviceZones.locality,
          })
          .from(vendorProfiles)
          .leftJoin(users, eq(vendorProfiles.userId, users.id))
          .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
          .where(
            input?.status ? eq(vendorProfiles.status, input.status) : undefined
          )
          .orderBy(desc(vendorProfiles.createdAt));
      }),
    reviewVendor: adminProcedure
      .input(
        z.object({
          vendorId: z.number().int().positive(),
          decision: z.enum(["approved", "rejected", "suspended"]),
          reason: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [v] = await db
          .select()
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, input.vendorId))
          .limit(1);
        if (!v) throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(vendorProfiles)
          .set({
            status: input.decision,
            reviewedBy: ctx.user.id,
            reviewedAt: new Date(),
            isOpen: input.decision === "approved" ? v.isOpen : false,
          })
          .where(eq(vendorProfiles.id, v.id));
        await audit(ctx.user.id, "vendor.review", "vendor", v.id, {
          decision: input.decision,
          reason: input.reason,
        });
        return { success: true };
      }),
    reviewRider: adminProcedure
      .input(
        z.object({
          riderId: z.number().int().positive(),
          decision: z.enum(["approved", "rejected", "suspended"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [r] = await db
          .select()
          .from(riderProfiles)
          .where(eq(riderProfiles.id, input.riderId))
          .limit(1);
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(riderProfiles)
          .set({
            status: input.decision,
            available: input.decision === "approved" ? r.available : false,
          })
          .where(eq(riderProfiles.id, r.id));
        await audit(ctx.user.id, "rider.review", "rider", r.id, {
          decision: input.decision,
        });
        return { success: true };
      }),
    supportTickets: adminProcedure
      .input(z.object({ status: z.enum(["open", "in_progress", "resolved", "closed"]).optional() }).optional())
      .query(async ({ input }) => {
        const db = await database();
        return db.select({
          ticket: supportTickets,
          customerName: users.name,
          customerEmail: users.email,
          orderNumber: orders.orderNumber,
        }).from(supportTickets)
          .innerJoin(users, eq(supportTickets.customerId, users.id))
          .leftJoin(orders, eq(supportTickets.orderId, orders.id))
          .where(input?.status ? eq(supportTickets.status, input.status) : undefined)
          .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
          .limit(200);
      }),
    supportThread: adminProcedure
      .input(z.object({ ticketId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await database();
        const [row] = await db.select({
          ticket: supportTickets,
          customerName: users.name,
          customerEmail: users.email,
          orderNumber: orders.orderNumber,
        }).from(supportTickets)
          .innerJoin(users, eq(supportTickets.customerId, users.id))
          .leftJoin(orders, eq(supportTickets.orderId, orders.id))
          .where(eq(supportTickets.id, input.ticketId)).limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const messages = await db.select({
          id: supportMessages.id,
          senderRole: supportMessages.senderRole,
          message: supportMessages.message,
          createdAt: supportMessages.createdAt,
        }).from(supportMessages)
          .where(eq(supportMessages.ticketId, row.ticket.id))
          .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
        return { ...row, messages };
      }),
    replySupport: adminProcedure
      .input(z.object({
        ticketId: z.number().int().positive(),
        message: z.string().trim().min(1).max(10_000),
        status: z.enum(["in_progress", "resolved", "closed"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [ticket] = await tx.select().from(supportTickets)
            .where(eq(supportTickets.id, input.ticketId)).for("update").limit(1);
          if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
          const [inserted] = await tx.insert(supportMessages).values({
            ticketId: ticket.id,
            senderUserId: ctx.user.id,
            senderRole: "admin",
            message: input.message,
          }).returning({ insertId: supportMessages.id });
          const status = input.status ?? "in_progress";
          await tx.update(supportTickets).set({ status, updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
          await writeAudit(tx, ctx.user.id, "support.ticket_replied", "support_ticket", ticket.id, { status });
          return { messageId: Number(inserted.insertId), status };
        });
      }),
    resetHandoverAttempts: adminProcedure
      .input(z.object({ orderId: z.number().int().positive(), reason: z.string().trim().min(8).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
          if (!order) throw new TRPCError({ code: "NOT_FOUND" });
          if (!["ready", "out_for_delivery"].includes(order.status) || !order.handoverLockedAt)
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a currently locked handover can be reset while the order remains ready or in delivery" });
          await tx.update(orders).set({ handoverAttempts: 0, handoverLockedAt: null }).where(eq(orders.id, order.id));
          await tx.insert(orderEvents).values({
            orderId: order.id,
            actorUserId: ctx.user.id,
            actorRole: "admin",
            fromStatus: order.status,
            toStatus: "handover_attempts_reset",
            note: input.reason,
          }).returning({ insertId: orderEvents.id });
          await writeAudit(tx, ctx.user.id, "handover.attempts_reset", "order", order.id, { reason: input.reason });
          return { success: true };
        });
      }),
    recordReturnRecovery: adminProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          inspectionNotes: z.string().trim().min(3).max(1000),
          items: z.array(returnRecoveryItemSchema).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .for("update")
            .limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
          return executeReturnRecovery(tx, {
            order: o,
            actorUserId: ctx.user.id,
            actorRole: "admin",
            inspectionNotes: input.inspectionNotes,
            items: input.items,
          });
        });
      }),
    cashCollections: adminProcedure.query(async () => {
      const db = await database();
      return db
        .select({
          payment: paymentRecords,
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          orderStatus: orders.status,
          expectedPaise: orders.totalPaise,
          vendorId: vendorProfiles.id,
          shopName: vendorProfiles.shopName,
        })
        .from(paymentRecords)
        .innerJoin(orders, eq(paymentRecords.orderId, orders.id))
        .innerJoin(vendorProfiles, eq(orders.vendorId, vendorProfiles.id))
        .where(inArray(paymentRecords.method, ["cod", "pickup"]))
        .orderBy(desc(paymentRecords.recordedAt), desc(paymentRecords.createdAt))
        .limit(250);
    }),
    reconcileCashCollection: adminProcedure
      .input(z.object({
        orderId: z.number().int().positive(),
        verifiedAmountPaise: z.number().int().min(0).max(2_147_483_647),
        reason: z.string().trim().min(8).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .for("update")
            .limit(1);
          const [payment] = await tx
            .select()
            .from(paymentRecords)
            .where(eq(paymentRecords.orderId, input.orderId))
            .for("update")
            .limit(1);
          if (!order || !payment) throw new TRPCError({ code: "NOT_FOUND" });
          if (order.status !== "delivered" || !["cod", "pickup"].includes(payment.method))
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only completed cash orders can be reconciled" });
          if (payment.status === "voided" || payment.status === "refunded")
            throw new TRPCError({ code: "CONFLICT", message: "This payment is voided or refunded" });
          if (!payment.recordedAt)
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No cash collector report exists yet; do not create a payment from an admin button" });
          if (payment.status === "collected")
            throw new TRPCError({ code: "CONFLICT", message: "Cash has already been recorded as collected" });
          const exact = input.verifiedAmountPaise === order.totalPaise;
          const variancePaise = input.verifiedAmountPaise - order.totalPaise;
          if (exact) {
            await tx.update(paymentRecords).set({ status: "collected", collectedAmountPaise: input.verifiedAmountPaise, reference: input.reason.slice(0, 120) }).where(eq(paymentRecords.id, payment.id));
            await tx.update(orders).set({ paymentStatus: "collected" }).where(eq(orders.id, order.id));
            await tx.update(financialLedger).set({ status: "recorded" }).where(and(eq(financialLedger.orderId, order.id), eq(financialLedger.status, "pending")));
          } else {
            await tx.update(paymentRecords).set({ collectedAmountPaise: input.verifiedAmountPaise, reference: input.reason.slice(0, 120) }).where(eq(paymentRecords.id, payment.id));
          }
          await tx.insert(orderEvents).values({
            orderId: order.id,
            actorUserId: ctx.user.id,
            actorRole: "admin",
            fromStatus: order.status,
            toStatus: exact ? "cash_reconciled" : "cash_variance_reviewed",
            note: input.reason,
            metadata: { expectedPaise: order.totalPaise, verifiedPaise: input.verifiedAmountPaise, variancePaise, exact },
          }).returning({ insertId: orderEvents.id });
          await writeAudit(tx, ctx.user.id, "cash.collection_reconciled", "order", order.id, {
            expectedPaise: order.totalPaise,
            verifiedPaise: input.verifiedAmountPaise,
            variancePaise,
            exact,
            reason: input.reason,
          });
          return { collected: exact, variancePaise };
        });
      }),
    orders: adminProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            vendorId: z.number().int().positive().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const db = await database();
        return db
          .select()
          .from(orders)
          .where(
            and(
              ...(input?.status
                ? [eq(orders.status, input.status as OrderStatus)]
                : []),
              ...(input?.vendorId ? [eq(orders.vendorId, input.vendorId)] : [])
            )
          )
          .orderBy(desc(orders.createdAt));
      }),
    updateOrderStatus: adminProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          status: z.enum(["cancelled", "rejected", "failed_delivery"]),
          reason: z.string().trim().min(1).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .for("update")
            .limit(1);
          if (!o) throw new TRPCError({ code: "NOT_FOUND" });
          assertOrderTransition("admin", o.status, input.status);
          if (input.status === "failed_delivery") {
            return await executeFailedDeliveryTransition(tx, {
              order: o,
              actorUserId: ctx.user.id,
              actorRole: "admin",
              reason: input.reason,
            });
          }
          if (input.status === "cancelled" || input.status === "rejected")
            await voidUncollectedOrder(tx, o, input.reason);
          const lines = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, o.id));
          if (input.status === "cancelled" || input.status === "rejected") {
            if (!o.stockRestoredAt)
              for (const line of lines)
                if (line.productId)
                  await tx
                    .update(products)
                    .set({
                      stockQuantity: sql`${products.stockQuantity} + ${line.quantity}`,
                    })
                    .where(eq(products.id, line.productId));
          }
          await tx
            .update(orders)
            .set({
              status: input.status,
              cancelReason: input.reason,
              stockRestoredAt: new Date(),
            })
            .where(eq(orders.id, o.id));
          if (["cancelled", "rejected"].includes(input.status))
            await tx
              .update(deliveryAssignments)
              .set({ status: "failed", deliveryProof: `Order ${input.status} by admin` })
              .where(
                and(
                  eq(deliveryAssignments.orderId, o.id),
                  inArray(deliveryAssignments.status, ["assigned", "accepted", "arrived", "picked_up"])
                )
              );
          await tx
            .insert(orderEvents)
            .values({
              orderId: o.id,
              actorUserId: ctx.user.id,
              actorRole: "admin",
              fromStatus: o.status,
              toStatus: input.status,
              note: input.reason,
            }).returning({ insertId: orderEvents.id });
          await writeAudit(tx, ctx.user.id, "order.admin_status", "order", o.id, {
            status: input.status,
            reason: input.reason,
          });
          return { success: true };
        });
      }),
    assignRider: adminProcedure
      .input(
        z.object({
          orderId: z.number().int().positive(),
          riderId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        return db.transaction(async tx => {
          const [o] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, input.orderId))
            .for("update")
            .limit(1);
          const [r] = await tx
            .select()
            .from(riderProfiles)
            .where(
              and(
                eq(riderProfiles.id, input.riderId),
                eq(riderProfiles.status, "approved"),
                eq(riderProfiles.available, true),
                eq(riderProfiles.townId, o?.townId ?? -1)
              )
            )
            .for("update")
            .limit(1);
          if (
            !o ||
            o.fulfillmentType !== "delivery" ||
            !["accepted", "preparing", "ready"].includes(o.status) ||
            !r
          )
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Order or rider is not eligible",
            });
          const riderBusy = await tx
            .select({ id: deliveryAssignments.id })
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.riderId, r.id),
                inArray(deliveryAssignments.status, ["assigned", "accepted", "arrived", "picked_up"])
              )
            )
            .limit(1);
          const existing = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, o.id),
                inArray(deliveryAssignments.status, [
                  "assigned",
                  "accepted",
                  "arrived",
                  "picked_up",
                ])
              )
            )
            .limit(1);
          if (existing.length)
            throw new TRPCError({ code: "CONFLICT", message: "An active rider is already assigned to this order" });
          if (riderBusy.length)
            throw new TRPCError({ code: "CONFLICT", message: "This rider already has an active delivery assignment" });
          await tx
            .insert(deliveryAssignments)
            .values({ orderId: o.id, riderId: r.id, assignedBy: ctx.user.id }).returning({ insertId: deliveryAssignments.id });
          await writeAudit(tx, ctx.user.id, "rider.assign", "order", o.id, {
            riderId: r.id,
          });
          return { success: true };
        });
      }),
    riders: adminProcedure.query(async () => {
      const db = await database();
      return db
        .select({ rider: riderProfiles, name: users.name, email: users.email })
        .from(riderProfiles)
        .innerJoin(users, eq(riderProfiles.userId, users.id))
        .orderBy(desc(riderProfiles.createdAt));
    }),
    categories: adminProcedure.query(async () => {
      const db = await database();
      return db.select().from(categories).orderBy(asc(categories.sortOrder));
    }),
    createCategory: adminProcedure
      .input(
        z.object({
          slug: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]+$/)
            .max(96),
          name: z.string().trim().min(1).max(120),
          icon: z.string().max(80).optional(),
          description: z.string().max(1000).optional(),
          enabled: z.boolean().default(true),
          regulated: z.boolean().default(false),
          sortOrder: z.number().int().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const res = await db
          .insert(categories)
          .values({
            ...input,
            icon: input.icon ?? null,
            description: input.description ?? null,
          }).returning({ insertId: categories.id });
        const id = Number(res[0].insertId);
        await audit(ctx.user.id, "category.create", "category", id);
        return { id };
      }),
    createTown: adminProcedure
      .input(
        z.object({
          slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(96),
          name: z.string().trim().min(1).max(160),
          state: z.string().trim().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const result = await db.insert(towns).values({
          ...input,
          countryCode: "IN",
          active: true,
          isDemo: false,
        }).returning({ insertId: towns.id });
        const id = Number(result[0].insertId);
        await audit(ctx.user.id, "town.create", "town", id);
        return { id };
      }),
    setTownActive: adminProcedure
      .input(z.object({ townId: z.number().int().positive(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [town] = await db
          .select()
          .from(towns)
          .where(eq(towns.id, input.townId))
          .limit(1);
        if (!town) throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(towns)
          .set({ active: input.active })
          .where(eq(towns.id, input.townId));
        await audit(ctx.user.id, "town.set_active", "town", input.townId, {
          active: input.active,
        });
        return { success: true };
      }),
    createServiceZone: adminProcedure
      .input(
        z.object({
          townId: z.number().int().positive(),
          name: z.string().trim().min(1).max(160),
          locality: z.string().trim().min(1).max(160),
          postalCode: z.string().trim().max(12).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [town] = await db
          .select()
          .from(towns)
          .where(and(eq(towns.id, input.townId), eq(towns.active, true)))
          .limit(1);
        if (!town)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active town" });
        const slug = `${input.locality
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 82)}-${crypto.randomUUID().slice(0, 8)}`;
        const result = await db.insert(serviceZones).values({
          ...input,
          slug,
          postalCode: input.postalCode ?? null,
          active: true,
        }).returning({ insertId: serviceZones.id });
        const id = Number(result[0].insertId);
        await audit(ctx.user.id, "zone.create", "service_zone", id, {
          townId: input.townId,
        });
        return { id };
      }),
    setZoneActive: adminProcedure
      .input(z.object({ zoneId: z.number().int().positive(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const [zone] = await db
          .select()
          .from(serviceZones)
          .where(eq(serviceZones.id, input.zoneId))
          .limit(1);
        if (!zone) throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(serviceZones)
          .set({ active: input.active })
          .where(eq(serviceZones.id, input.zoneId));
        await audit(ctx.user.id, "zone.set_active", "service_zone", input.zoneId, {
          active: input.active,
        });
        return { success: true };
      }),
    updateVendorTerms: adminProcedure
      .input(
        z
          .object({
            vendorId: z.number().int().positive(),
            commissionBps: z.number().int().min(0).max(3000).optional(),
            deliveryFeePaise: z.number().int().min(0).max(50_000).optional(),
            platformFeePaise: z.number().int().min(0).max(5_000).optional(),
            minimumOrderPaise: z.number().int().min(0).max(100_000_000).optional(),
            deliveryEnabled: z.boolean().optional(),
            pickupEnabled: z.boolean().optional(),
          })
          .refine(({ vendorId, ...patch }) => Object.keys(patch).length > 0, "No terms were provided")
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const { vendorId, ...patch } = input;
        const [vendor] = await db
          .select({ id: vendorProfiles.id })
          .from(vendorProfiles)
          .where(eq(vendorProfiles.id, vendorId))
          .limit(1);
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });
        await db
          .update(vendorProfiles)
          .set(patch)
          .where(eq(vendorProfiles.id, vendorId));
        await audit(ctx.user.id, "vendor.terms", "vendor", vendorId, patch);
        return { success: true };
      }),
    orderDetail: adminProcedure
      .input(z.object({ orderId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await database();
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          order,
          items: await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id)),
          timeline: await db
            .select()
            .from(orderEvents)
            .where(eq(orderEvents.orderId, order.id))
            .orderBy(asc(orderEvents.createdAt)),
        };
      }),
    settings: adminProcedure.query(async () => {
      const db = await database();
      return {
        settings: await db.select().from(platformSettings),
        towns: await db.select().from(towns),
        zones: await db.select().from(serviceZones),
      };
    }),
    updateSettings: adminProcedure
      .input(
        z.object({ key: z.string().trim().min(1).max(100), value: z.unknown() })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        await db
          .insert(platformSettings)
          .values({
            key: input.key,
            value: input.value,
            updatedBy: ctx.user.id,
          })
          .onConflictDoUpdate({ target: [platformSettings.key],
            set: { value: input.value, updatedBy: ctx.user.id },
          });
        await audit(ctx.user.id, "settings.update", "setting", null, {
          key: input.key,
        });
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
