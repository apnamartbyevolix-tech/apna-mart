import {activeOffer,effectiveProduct} from "../../shared/offers";
import {withinShopHours} from '../../shared/shop-hours';
import { connectedCatalogue, publishedSellerCondition, publishedProductCondition } from './publication-policy';
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { checkoutIntent, type CheckoutInput } from "../../shared/checkout";
import {
  categories,
  customerAddresses,
  orderEvents,
  orders,
  products,
  serviceZones,
  towns,
  vendorProfiles,
  type User,
} from "../../drizzle/schema";
import type { getDb } from "../db";
import {
  assertServesZone,
  calculateOrderTotals,
  makeAddressSnapshot,
} from "./domain";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const requestFingerprint = (input: CheckoutInput, customerId: number) =>
  hash(checkoutIntent(input, customerId));

export async function duplicateCheckout(
  db: Database | Transaction,
  order: typeof orders.$inferSelect,
  input: CheckoutInput,
  customerId: number
) {
  const [event] = await db
    .select({ metadata: orderEvents.metadata })
    .from(orderEvents)
    .where(
      and(eq(orderEvents.orderId, order.id), eq(orderEvents.toStatus, "placed"))
    )
    .limit(1);
  if (
    event?.metadata?.checkoutRequestV1 !== requestFingerprint(input, customerId)
  )
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This checkout key belongs to a different or older request. Check your order history before submitting again.",
    });
  return { orderId: order.id, orderNumber: order.orderNumber, duplicate: true };
}

// Both quotation and placement use these same locked reads and integer-paise rules.
export async function prepareCheckout(
  tx: Transaction,
  input: CheckoutInput,
  user: Pick<User, "id" | "name">,
  trustedHeldStock: ReadonlyMap<number,number> = new Map()
) {
  if (
    (input.fulfillmentType === "delivery" && input.paymentMethod !== "cod") ||
    (input.fulfillmentType === "pickup" && input.paymentMethod !== "pickup")
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Delivery accepts cash on delivery; pickup accepts cash on pickup",
    });
  const [shop] = await tx
    .select()
    .from(vendorProfiles)
    .where(
      and(
        eq(vendorProfiles.id, input.shopId),
        eq(vendorProfiles.townId, input.townId),
        eq(vendorProfiles.status, "approved"),
        publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
        eq(vendorProfiles.isOpen, true)
      )
    )
    .for("update")
    .limit(1);
  if (!shop)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Shop is not accepting orders in the selected town",
    });
  if(connectedCatalogue()&&!withinShopHours(shop.settings))throw new TRPCError({code:'PRECONDITION_FAILED',message:'This shop is outside its online opening hours (India time)'});
  const [activeTown] = await tx
    .select({ id: towns.id })
    .from(towns)
    .where(and(eq(towns.id, input.townId), eq(towns.active, true)))
    .for("update")
    .limit(1);
  const [selectedZone] = await tx
    .select({ id: serviceZones.id })
    .from(serviceZones)
    .where(
      and(
        eq(serviceZones.id, input.zoneId),
        eq(serviceZones.townId, input.townId),
        eq(serviceZones.active, true)
      )
    )
    .for("update")
    .limit(1);
  const [activeShopZone] = await tx
    .select({ id: serviceZones.id, locality: serviceZones.locality })
    .from(serviceZones)
    .where(
      and(
        eq(serviceZones.id, shop.zoneId),
        eq(serviceZones.townId, input.townId),
        eq(serviceZones.active, true)
      )
    )
    .for("update")
    .limit(1);
  if (!activeTown || !selectedZone || !activeShopZone)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This town or shop service area is not active",
    });
  const [shopCategory] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.id, shop.categoryId),
        eq(categories.enabled, true),
        eq(categories.regulated, false)
      )
    )
    .for("update")
    .limit(1);
  if (!shopCategory)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This shop category is not available for orders",
    });
  if (input.fulfillmentType === "delivery" && shop.zoneId !== input.zoneId)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This shop does not deliver to your selected service area",
    });
  let zoneId = shop.zoneId;
  let addressSnapshot: ReturnType<typeof makeAddressSnapshot> | null = null;
  let custName = user.name ?? "Customer";
  let custPhone: string | null = null;
  if (input.fulfillmentType === "delivery") {
    if (!shop.deliveryEnabled || !input.addressId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Select a delivery address",
      });
    const [address] = await tx
      .select()
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, input.addressId),
          eq(customerAddresses.userId, user.id)
        )
      )
      .for("update")
      .limit(1);
    if (!address)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Address not found",
      });
    if (address.townId !== input.townId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Delivery address is outside the selected town",
      });
    if (address.zoneId !== input.zoneId)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Choose an address in your selected service area",
      });
    assertServesZone(shop.zoneId, address.zoneId, shop.deliveryEnabled);
    zoneId = address.zoneId;
    addressSnapshot = makeAddressSnapshot(address);
    custName = address.recipientName;
    custPhone = address.phone;
  } else if (!shop.pickupEnabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Pickup is not available at this shop",
    });
  const ids = [...new Set(input.items.map(i => i.productId))];
  if (ids.length !== input.items.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Duplicate product lines are not allowed",
    });
  const productRows = await tx
    .select({ product: products, category: categories })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(inArray(products.id, ids), eq(products.vendorId, shop.id), publishedProductCondition(products.id, products.vendorId, products.isDemo)))
    .for("update");
  for (const row of productRows) {
    if (
      row.product.availability !== "available" ||
      !row.category.enabled ||
      row.category.regulated
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${row.product.name} is unavailable. Remove it from your cart or try again later.`,
      });
  }
  const rows = productRows.map(row => row.product);
  if (rows.length !== ids.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more products are unavailable",
    });
  const items = input.items.map(i => {
    const source = effectiveProduct(rows.find(x => x.id === i.productId)!);
    const offer=activeOffer(source.offerMeta);if(offer?.maxPerOrder&&i.quantity>offer.maxPerOrder)throw new TRPCError({code:"BAD_REQUEST",message:`This offer allows up to ${offer.maxPerOrder} units per order`});
    // Only the server's unexpired reservation can supply this retry allowance.
    const p = { ...source, stockQuantity: Math.max(source.stockQuantity, trustedHeldStock.get(source.id) || 0) };
    if (p.stockQuantity < i.quantity)
      throw new TRPCError({
        code: "CONFLICT",
        message: `${p.name} has insufficient stock`,
      });
    return { product: p, quantity: i.quantity };
  });
  const totals = calculateOrderTotals({
    items: items.map(i => ({
      pricePaise: i.product.pricePaise,
      quantity: i.quantity,
    })),
    deliveryFeePaise:
      input.fulfillmentType === "delivery" ? shop.deliveryFeePaise : 0,
    platformFeePaise: shop.platformFeePaise,
    commissionBps: shop.commissionBps,
  });
  if (totals.subtotalPaise < shop.minimumOrderPaise)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Order is below the shop minimum",
    });

  const { commissionPaise: _commission, ...payable } = totals;
  const review = {
    items: items.map(i => ({
      productId: i.product.id,
      name: i.product.name,
      unit: i.product.unit,
      quantity: i.quantity,
      unitPricePaise: i.product.pricePaise,
      lineTotalPaise: i.product.pricePaise * i.quantity,
    })),
    totals: payable,
    address: addressSnapshot
      ? {
          recipientName: addressSnapshot.recipientName,
          phone: addressSnapshot.phone,
          line1: addressSnapshot.line1,
          line2: addressSnapshot.line2,
          landmark: addressSnapshot.landmark,
          postalCode: addressSnapshot.postalCode,
          townId: addressSnapshot.townId,
          zoneId: addressSnapshot.zoneId,
        }
      : null,
    minimumOrderPaise: shop.minimumOrderPaise,
    fulfillmentType: input.fulfillmentType,
  };
  const quoteFingerprint = hash(
    JSON.stringify([
      requestFingerprint(input, user.id),
      review,
      addressSnapshot,
    ])
  );
  return {
    shop,
    items,
    totals,
    zoneId,
    addressSnapshot,
    custName,
    custPhone,
    quote: { ...review, quoteFingerprint },
  };
}
