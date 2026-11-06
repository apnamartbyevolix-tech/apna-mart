/** v1.2-sandbox implementation, confined to disposable localhost databases. */
import express, { type Express } from "express";
import {verifyConnection,validateLinkAuth} from './link-auth';
import {withinShopHours} from '../../../shared/shop-hours';
import {
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import {
  products,
  vendorProfiles,
  vendorCategories,
  orders,
  paymentRecords,
  orderItems,
} from "../../../drizzle/schema";
import { SignedSandboxTransport } from "./transport";
import type { Operation } from "./adapter";
import { prepareCheckout } from "../../marketplace/checkout";

export const sandboxEnabled = () =>
  process.env.MTM_APNA_SANDBOX_ENABLED === "1";
export function assertSandbox() {
  validateLinkAuth();
  const u = new URL(process.env.DATABASE_URL || "");
  const peer = new URL(process.env.APNA_SANDBOX_URL || "");
  if (
    !sandboxEnabled() ||
    process.env.NODE_ENV === "production" ||
    !["127.0.0.1", "localhost", "::1"].includes(process.env.HOST || "") ||
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !u.pathname.endsWith("_test") ||
    peer.protocol !== "https:" ||
    peer.hostname !== "localhost" ||
    peer.pathname !== "/" ||
    peer.search ||
    peer.hash ||
    peer.username ||
    peer.password ||
    (process.env.APNA_SANDBOX_KEY || "").length < 32 ||
    (process.env.APNA_SANDBOX_SECRET || "").length < 32
  )
    throw Error("Isolated localhost Apna sandbox required");
}
const rows = async (db: any, q: any): Promise<any[]> => {
  const r = await db.execute(q);
  return r[0] as any[];
};
const canonical = (v: any): string =>
  Array.isArray(v)
    ? "[" + v.map(canonical).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .sort()
          .map(k => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}"
      : JSON.stringify(v);
const decode = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
function transport() {
  assertSandbox();
  return new SignedSandboxTransport({
    baseUrl: process.env.APNA_SANDBOX_URL!,
    allowedSandboxHosts: ["localhost"],
    apiKey: process.env.APNA_SANDBOX_KEY!,
    signingSecret: process.env.APNA_SANDBOX_SECRET!,
    encodeSignature: d => d.toString("hex"),
  });
}
const wire = (op: Operation, b: any, key: string) =>
  transport().post(op, { revision: "1.2-sandbox", ...b }, key);
const unavailable = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "The shop connection could not be confirmed. Your existing orders are safe. Try again shortly.",
  });
async function verify(merchantId: string) {
  const v: any = await wire("verifyMerchant", { merchantId }, randomUUID());
  if (
    v?.isValid !== true ||
    v.marketplaceEnabled !== true ||
    v.live !== true ||
    typeof v.tier !== "string" ||
    !v.tier ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    Date.parse(v.expiresAt) <= Date.now()
  )
    throw unavailable();
  return v;
}

const catalogueSchema = z
  .object({
    revision: z.literal("1.2-sandbox"),
    merchantId: z.string().uuid(),
    version: z.number().int().positive(),
    live: z.boolean(),
    shop: z.object({ name: z.string().trim().min(2).max(100) }).strict(),
    eligibility: z
      .object({
        isValid: z.boolean(),
        tier: z.string(),
        expiresAt: z.string().datetime(),
        marketplaceEnabled: z.boolean(),
        currency: z.literal("INR"),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            sku: z.string().min(1).max(100),
            name: z.string().min(1).max(180),
            unit: z.string().min(1).max(48),
            pricePaise: z.number().int().positive().max(100000000),
            quantity: z.number().int().min(0).max(1000000),
            offer:z.object({id:z.string().uuid(),title:z.string().min(3).max(100),festival:z.string().max(40).nullable(),referencePricePaise:z.number().int().positive(),pricePaise:z.number().int().positive(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),maxPerOrder:z.number().int().positive().max(100).nullable()}).nullable().optional(),
          })
          .strict()
      )
      .max(30),
  })
  .strict();
let refreshAt = 0,
  refreshing: Promise<void> | undefined;
export async function refreshLinkedEligibility() {
  if (!sandboxEnabled() || Date.now() < refreshAt) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const db = await getDb();
    if (!db) throw unavailable();
    const links = await rows(db, sql`SELECT * FROM apna_links`);
    for (const l of links) {
      let valid = false;
      try {
        await verify(l.merchant_id);
        valid = !!l.live;
      } catch {}
      const [shop]=await db.select({settings:vendorProfiles.settings}).from(vendorProfiles).where(eq(vendorProfiles.id,l.vendor_id));
      await db
        .update(vendorProfiles)
        .set({ status: valid ? "approved" : "suspended", isOpen: valid&&withinShopHours(shop?.settings) })
        .where(eq(vendorProfiles.id, l.vendor_id));
    }
    refreshAt = Date.now() + 5000;
  })();
  try {
    await refreshing;
  } finally {
    refreshing = undefined;
  }
}
export function registerApnaSandbox(app: Express) {
  if (!sandboxEnabled()) return;
  assertSandbox();
  app.post(
    "/api/internal/apna/catalogue",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      try {
        const raw = req.body as Buffer,
          ts = String(req.headers["x-apna-galla-timestamp"] || ""),
          signature = String(req.headers["x-apna-galla-signature"] || ""),
          key = String(req.headers["x-apna-galla-key"] || ""),
          requestKey = String(req.headers["idempotency-key"] || "");
        const equal = (a: string, b: string) =>
          a.length === b.length &&
          timingSafeEqual(Buffer.from(a), Buffer.from(b));
        if (
          !Buffer.isBuffer(raw) ||
          raw.length > 65536 ||
          !/^\d{10}$/.test(ts) ||
          Math.abs(Date.now() / 1000 - Number(ts)) > 120 ||
          !equal(key, process.env.APNA_SANDBOX_KEY!) ||
          !/^[0-9a-f]{64}$/.test(signature) ||
          !equal(
            signature,
            createHmac("sha256", process.env.APNA_SANDBOX_SECRET!)
              .update(ts + ".")
              .update(raw)
              .digest("hex")
          ) ||
          !z.string().uuid().safeParse(requestKey).success
        ) {
          res.status(401).json({ error: "Invalid sandbox authentication" });
          return;
        }
        try{verifyConnection('apna',req.method,req.originalUrl,raw,req.headers);}catch{res.status(401).json({message:'Invalid server signature'});return;}
        const b = catalogueSchema.parse(JSON.parse(raw.toString("utf8")));
        if (new Set(b.items.map(i => i.sku)).size !== b.items.length)
          throw Error("Duplicate SKU");
        const db = await getDb();
        if (!db) throw Error("Database unavailable");
        const acknowledged = (await rows(db,sql`SELECT version FROM apna_links WHERE merchant_id=${b.merchantId}`))[0];
        // A delayed live event must be acknowledged after a newer pause, without reopening the shop.
        if(acknowledged && acknowledged.version >= b.version){res.json({success:true});return;}
        if (b.live) await verify(b.merchantId);
        await db.transaction(async tx => {
          // Named lock is unnecessary: the merchant row, or unique merchant slug for first publication, serializes delivery.
          const existing = (
            await rows(
              tx,
              sql`SELECT * FROM apna_links WHERE merchant_id=${b.merchantId} FOR UPDATE`
            )
          )[0];
          if (existing && existing.version >= b.version) return;
          const townId = Number(process.env.APNA_SANDBOX_TOWN_ID),
            zoneId = Number(process.env.APNA_SANDBOX_ZONE_ID),
            categoryId = Number(process.env.APNA_SANDBOX_CATEGORY_ID),
            userId = Number(process.env.APNA_SANDBOX_VENDOR_USER_ID);
          if (
            ![townId, zoneId, categoryId, userId].every(
              x => Number.isSafeInteger(x) && x > 0
            )
          )
            throw Error("Sandbox identity mapping required");
          let vendorId = existing?.vendor_id;
          if (!vendorId) {
            const v = await tx
              .insert(vendorProfiles)
              .values({
                userId,
                townId,
                zoneId,
                categoryId,
                slug: "apna-" + b.merchantId,
                shopName: b.shop.name,
                address: "Demo Bazaar · sandbox test location",
                isDemo: true,
                status: "pending",
                isOpen: false,
                deliveryEnabled: true,
                pickupEnabled: true,
              });
            vendorId = Number(v[0].insertId);
            await tx.insert(vendorCategories).values({ vendorId, categoryId });
          }
          const [hours]=await tx.select({settings:vendorProfiles.settings}).from(vendorProfiles).where(eq(vendorProfiles.id,vendorId));
          await tx
            .update(vendorProfiles)
            .set({
              shopName: b.shop.name,
              status: b.live ? "approved" : "suspended",
              isOpen: b.live&&withinShopHours(hours?.settings),
            })
            .where(eq(vendorProfiles.id, vendorId));
          await tx
            .update(products)
            .set({ availability: "archived" })
            .where(eq(products.vendorId, vendorId));
          for (const i of b.items) {
            const p = (
              await rows(
                tx,
                sql`SELECT * FROM apna_products WHERE vendor_id=${vendorId} AND sku=${i.sku}`
              )
            )[0];
            let productId = p?.product_id;
            const values = {
              name: i.name,
              unit: i.unit,
              pricePaise: i.pricePaise,
              offerMeta:i.offer||null,
              stockQuantity: i.quantity,
              availability: "available" as const,
            };
            if (productId)
              await tx
                .update(products)
                .set(values)
                .where(eq(products.id, productId));
            else {
              const inserted = await tx
                .insert(products)
                .values({
                  ...values,
                  vendorId,
                  categoryId,
                  slug:
                    "apna-" +
                    createHash("sha256")
                      .update(i.sku)
                      .digest("hex")
                      .slice(0, 24),
                  isDemo: true,
                });
              productId = Number(inserted[0].insertId);
              await tx.execute(
                sql`INSERT INTO apna_products(product_id,vendor_id,sku) VALUES(${productId},${vendorId},${i.sku})`
              );
            }
          }
          await tx.execute(
            sql`INSERT INTO apna_links(merchant_id,vendor_id,version,live,expires_at,verified_at) VALUES(${b.merchantId},${vendorId},${b.version},${b.live},${new Date(b.eligibility.expiresAt)},now()) ON DUPLICATE KEY UPDATE version=VALUES(version),live=VALUES(live),expires_at=VALUES(expires_at),verified_at=now()`
          );
        });
        refreshAt = 0;
        res.json({ success: true });
      } catch {
        res
          .status(503)
          .json({
            error: "Catalogue update was not confirmed; retry the same version",
          });
      }
    }
  );
  app.use("/api/trpc", async (_req, _res, next) => {
    try {
      await refreshLinkedEligibility();
      next();
    } catch {
      next(unavailable());
    }
  });
  let pumping = false;
  const timer = setInterval(async () => {
    if (pumping) return;
    pumping = true;
    try {
      await relayApnaOutbox();
    } catch {
    } finally {
      pumping = false;
    }
  }, 2000);
  timer.unref();
}

export type CheckoutHold = {
  reference: string;
  merchantId: string;
  reservationId: string;
};
export async function trustedCheckoutStock(
  db: any,
  input: any,
  userId: number
): Promise<ReadonlyMap<number, number>> {
  const map = new Map<number, number>();
  if (!sandboxEnabled() || !input.idempotencyKey) return map;
  const ref = createHash("sha256")
    .update(userId + ":" + input.idempotencyKey)
    .digest("hex");
  const c = (
    await rows(db, sql`SELECT * FROM apna_checkouts WHERE reference=${ref}`)
  )[0];
  const response = c && decode(c.response);
  if (
    !c ||
    c.vendor_id !== input.shopId ||
    c.state !== "HOLD" ||
    !response ||
    Date.parse(response.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(response.expiresAt))
  )
    return map;
  const mappings = await rows(
    db,
    sql`SELECT * FROM apna_products WHERE vendor_id=${input.shopId}`
  );
  for (const line of decode(c.body).items) {
    const m = mappings.find(m => m.sku === line.sku);
    if (m) map.set(m.product_id, line.quantity);
  }
  return map;
}
export async function orderSyncStatus(db: any, id: number) {
  if (!sandboxEnabled()) return null;
  const c = (
    await rows(db, sql`SELECT state FROM apna_checkouts WHERE order_id=${id}`)
  )[0];
  if (!c) return null;
  const errors = await rows(
    db,
    sql`SELECT last_error FROM apna_outbox WHERE order_id=${id} AND NOT done ORDER BY id DESC LIMIT 1`
  );
  return {
    state: c.state,
    pending: c.state === "HOLD",
    message: errors[0]?.last_error || null,
  };
}
export async function reserveForCheckout(
  db: any,
  input: any,
  user: any
): Promise<CheckoutHold | undefined> {
  if (!sandboxEnabled()) return;
  const l = (
    await rows(
      db,
      sql`SELECT * FROM apna_links WHERE vendor_id=${input.shopId}`
    )
  )[0];
  if (!l) return;
  await verify(l.merchant_id);
  const trusted = await trustedCheckoutStock(db, input, user.id);
  const prepared = await db.transaction((tx: any) =>
    prepareCheckout(tx, input, user, trusted)
  );
  if (input.quoteFingerprint !== prepared.quote.quoteFingerprint)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Review the current cart and total before confirming",
    });
  if (
    prepared.totals.totalPaise !== prepared.totals.subtotalPaise ||
    prepared.totals.commissionPaise !== 0
  )
    throw unavailable();
  const mappings = await rows(
    db,
    sql`SELECT * FROM apna_products WHERE vendor_id=${input.shopId}`
  );
  const reference = createHash("sha256")
    .update(user.id + ":" + input.idempotencyKey)
    .digest("hex");
  const items = prepared.items
    .map((i: any) => {
      const m = mappings.find(m => m.product_id === i.product.id);
      if (!m) throw unavailable();
      return {
        sku: m.sku,
        quantity: i.quantity,
        pricePaise: i.product.pricePaise,
      };
    })
    .sort((a: any, b: any) => a.sku.localeCompare(b.sku));
  const body = { merchantId: l.merchant_id, reference, items };
  const candidate = randomUUID();
  await db.execute(
    sql`INSERT IGNORE INTO apna_checkouts(reference,merchant_id,vendor_id,request_key,body) VALUES(${reference},${l.merchant_id},${input.shopId},${candidate},${JSON.stringify(body)})`
  );
  const row = (
    await rows(
      db,
      sql`SELECT * FROM apna_checkouts WHERE reference=${reference}`
    )
  )[0];
  if (canonical(decode(row.body)) !== canonical(body))
    throw new TRPCError({
      code: "CONFLICT",
      message: "This checkout key belongs to another cart",
    });
  const result: any =
    decode(row.response) || (await wire("reserveStock", body, row.request_key));
  if (
    result?.success !== true ||
    !z.string().uuid().safeParse(result.reservationId).success ||
    result.totalPaise !== prepared.totals.subtotalPaise ||
    !Number.isFinite(Date.parse(result.expiresAt)) ||
    Date.parse(result.expiresAt) <= Date.now()
  )
    throw unavailable();
  await db.execute(
    sql`UPDATE apna_checkouts SET response=${JSON.stringify(result)} WHERE reference=${reference}`
  );
  return {
    reference,
    merchantId: l.merchant_id,
    reservationId: result.reservationId,
  };
}
export async function attachCheckout(
  tx: any,
  hold: CheckoutHold | undefined,
  orderId: number,
  orderNumber: string
) {
  if (!hold) return;
  await tx.execute(
    sql`UPDATE apna_checkouts SET order_id=${orderId} WHERE reference=${hold.reference} AND order_id IS NULL`
  );
  const body = {
    merchantId: hold.merchantId,
    reservationId: hold.reservationId,
    orderNumber,
  };
  await tx.execute(
    sql`INSERT INTO apna_outbox(order_id,operation,request_key,body) VALUES(${orderId},'commit',${randomUUID()},${JSON.stringify(body)})`
  );
}
export async function relayApnaOutbox() {
  if (!sandboxEnabled()) return;
  assertSandbox();
  const db = await getDb();
  if (!db) return;
  const pending = await rows(
    db,
    sql`SELECT id FROM apna_outbox WHERE NOT done AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY id LIMIT 8`
  );
  for (const candidate of pending) {
    const row = await db.transaction(async tx => {
      const r = (
        await rows(
          tx,
          sql`SELECT * FROM apna_outbox WHERE id=${candidate.id} AND NOT done AND (lease_until IS NULL OR lease_until<now()) FOR UPDATE`
        )
      )[0];
      if (!r) return;
      const checkout = (
        await rows(
          tx,
          sql`SELECT * FROM apna_checkouts WHERE order_id=${r.order_id}`
        )
      )[0];
      if (r.operation === "sale" && checkout.state === "HOLD") return;
      const [o] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, r.order_id));
      if (
        r.operation === "commit" &&
        ["cancelled", "rejected"].includes(o.status)
      ) {
        await tx.execute(
          sql`UPDATE apna_outbox SET done=true,last_error=NULL WHERE id=${r.id}`
        );
        return;
      }
      const response = decode(checkout.response);
      let operation = r.operation;
      let body = decode(r.body) || {
        merchantId: checkout.merchant_id,
        reservationId: response.reservationId,
        orderNumber: o.orderNumber,
      };
      if (operation === "sale" && !r.body) {
        const [p] = await tx
          .select()
          .from(paymentRecords)
          .where(eq(paymentRecords.orderId, o.id));
        if (p?.collectedAmountPaise !== o.totalPaise) {
          await tx.execute(
            sql`UPDATE apna_outbox SET last_error='Cash collection needs reconciliation',next_at=DATE_ADD(now(),INTERVAL 10 SECOND) WHERE id=${r.id}`
          );
          return;
        }
        body = {
          ...body,
          totalPaise: o.totalPaise,
          cashCollectedPaise: p.collectedAmountPaise,
        };
      }
      if (operation === "return") {
        const lines = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, o.id));
        const mappings = await rows(
          tx,
          sql`SELECT * FROM apna_products WHERE vendor_id=${o.vendorId}`
        );
        if (!r.body)
          body = {
            ...body,
            disposition: lines.map(l => ({
              sku: mappings.find(m => m.product_id === l.productId)?.sku,
              restocked: l.restockedQuantity,
              damaged: l.damagedQuantity,
              missing: l.missingQuantity,
            })),
          };
        operation = "release";
      }
      const key = r.request_key || randomUUID();
      await tx.execute(
        sql`UPDATE apna_outbox SET request_key=${key},body=${JSON.stringify(body)},lease_until=DATE_ADD(now(),INTERVAL 90 SECOND) WHERE id=${r.id}`
      );
      return { ...r, key, body, operation };
    });
    if (!row) continue;
    try {
      const op: Operation =
        row.operation === "commit"
          ? "commitStock"
          : row.operation === "sale"
            ? "postSale"
            : "releaseStock";
      const result: any = await wire(op, row.body, row.key);
      if (result?.success !== true) throw unavailable();
      await db.transaction(async tx => {
        await tx.execute(
          sql`UPDATE apna_outbox SET done=true,lease_until=NULL,last_error=NULL WHERE id=${row.id}`
        );
        if (row.operation === "commit")
          await tx.execute(
            sql`UPDATE apna_checkouts SET state='COMMITTED' WHERE order_id=${row.order_id} AND state='HOLD' AND EXISTS(SELECT 1 FROM orders WHERE id=${row.order_id} AND status NOT IN('cancelled','rejected'))`
          );
        else
          await tx.execute(
            sql`UPDATE apna_checkouts SET state=${row.operation === "sale" ? "FULFILLED" : "RELEASED"} WHERE order_id=${row.order_id}`
          );
      });
    } catch {
      await db.execute(
        sql`UPDATE apna_outbox SET attempts=attempts+1,last_error='Apna confirmation pending; retry is safe',next_at=DATE_ADD(now(),INTERVAL 10 SECOND),lease_until=NULL WHERE id=${row.id}`
      );
    }
  }
}
