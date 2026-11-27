import { retryOrderSync } from "./retry-order-sync";
import { relayApnaOutbox, writeCatalogueProducts } from "../integrations/apna-galla/sandbox";
import { SignedSandboxTransport } from "../integrations/apna-galla/transport";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { publishedSellerCondition, publishedProductCondition } from "./publication-policy";
import { prepareCheckout } from "./checkout";
import { reserveSmsBudget } from "../auth/sms-budget";
import { provisionPublishedLocation } from "./published-location";
import { appRouter } from "../routers";
import { getDb, upsertUser } from "../db";
import type { TrpcContext } from "../_core/context";
import {
  auditRecords,
  categories,
  customerAddresses,
  deliveryAssignments,
  financialLedger,
  orders,
  orderEvents,
  orderItems,
  paymentRecords,
  products,
  riderProfiles,
  serviceZones,
  towns,
  users,
  vendorProfiles,
  type User,
} from "../../drizzle/schema";
import { validateIntegrationDatabaseUrl } from "./integration-guard";

const isIsolatedTestConfig =
  process.env.MTM_RUN_ISOLATED_DB_TESTS === "1" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.PUBLIC_PREVIEW;

const rawDsn = process.env.DATABASE_URL;

// Fail-closed enforcement: if test runner requested isolated tests, abort if unsafe.
if (process.env.MTM_RUN_ISOLATED_DB_TESTS === "1") {
  if (process.env.NODE_ENV === "production" || process.env.PUBLIC_PREVIEW === "1") {
    throw new Error(
      "Refusing to execute integration tests in production or public preview environment. Tests must run only in isolated test configurations."
    );
  }
  const check = validateIntegrationDatabaseUrl(rawDsn);
  if (!check.valid) {
    throw new Error(
      `Integration test safety validation failed (fail-closed): ${check.reason}`
    );
  }
}

const validation = validateIntegrationDatabaseUrl(rawDsn);
const integrationEnabled = isIsolatedTestConfig && validation.valid;

const workflow = describe.skipIf(!integrationEnabled)(
  "isolated MyTown Market transaction workflows",
  () => {
    let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
    let townId: number;
    let zoneId: number;
    let otherZoneId: number;
    let categoryId: number;
    let shopId: number;
    let vendorUser: User;
    let customer: User;
    let admin: User;
    let rider: User;
    let riderId: number;
    let productsByKey: Record<string, { id: number; stock: number; price: number }>;
    let customerAddressId: number;

    async function createUser(label: string, role: "user" | "admin" = "user") {
      const suffix = randomUUID();
      const [inserted] = await db.insert(users).values({
        openId: `e2e-${label}-${suffix}`,
        name: `Isolated ${label}`,
        email: `${label}-${suffix}@example.invalid`,
        loginMethod: "isolated-test-only",
        role,
      }).returning({ insertId: users.id });
      const [row] = await db.select().from(users).where(eq(users.id, Number(inserted.insertId))).limit(1);
      if (!row) throw new Error("Could not load an isolated test identity");
      return row;
    }

    function caller(user: User | null) {
      const context = {
        req: { headers: {} },
        res: { clearCookie: () => undefined },
        user,
      } as unknown as TrpcContext;
      return appRouter.createCaller(context);
    }

    async function addProduct(key: string) {
      const suffix = randomUUID();
      const [inserted] = await db.insert(products).values({
        vendorId: shopId,
        categoryId,
        slug: `e2e-${key}-${suffix}`,
        name: `Isolated test ${key}`,
        description: "Temporary product in the disposable integration database",
        unit: "piece",
        pricePaise: 1299,
        mrpPaise: 1499,
        stockQuantity: 50,
        availability: "available",
        imageUrl: null,
        isDemo: false,
      }).returning({ insertId: products.id });
      return { id: Number(inserted.insertId), stock: 50, price: 1299 };
    }

    async function createOrder(
      who = caller(customer),
      product: { id: number; stock: number; price: number } = productsByKey.delivery,
      fulfillmentType: "delivery" | "pickup" = "delivery",
      idempotencyKey = `e2e_${randomUUID()}`
    ) {
      const input = {
        idempotencyKey,
        shopId,
        townId,
        zoneId,
        items: [{ productId: product.id, quantity: 1 }],
        ...(fulfillmentType === "delivery" ? { addressId: customerAddressId } : {}),
        fulfillmentType,
        paymentMethod: fulfillmentType === "delivery" ? "cod" as const : "pickup" as const,
        notes: "Isolated end-to-end test",
        substitutionPreference: "No substitutions",
      };
      const quote = await who.marketplace.quoteOrder(input);
      return who.marketplace.placeOrder({ ...input, quoteFingerprint: quote.quoteFingerprint });
    }

    it("reserves a shared SMS ceiling atomically across concurrent requests", async () => {
      const prefix = `budget_${randomUUID()}_`;
      const env = { MTM_SMS_DAILY_LIMIT: "3", MTM_SMS_MONTHLY_LIMIT: "5" };
      const now = new Date("2026-11-27T05:00:00Z");
      const keyFor = (key: string) => createHash("sha256").update(prefix + key).digest("hex");
      const buckets = [keyFor("sms-budget:day:2026-11-27"), keyFor("sms-budget:day:2026-11-28"), keyFor("sms-budget:month:2026-11")];
      const reserve = (at: Date) => db.transaction(tx => reserveSmsBudget(tx, keyFor, at, env));
      try {
        const day = await Promise.all(Array.from({ length: 12 }, () => reserve(now)));
        expect(day.filter(Boolean)).toHaveLength(3);
        const nextDay = await Promise.all(Array.from({ length: 8 }, () => reserve(new Date("2026-11-28T05:00:00Z"))));
        expect(nextDay.filter(Boolean)).toHaveLength(2);
        const result = await db.execute(sql`SELECT hits FROM customer_auth_limits WHERE bucket IN (${buckets[0]},${buckets[1]},${buckets[2]}) ORDER BY hits`);
        expect(result.rows.map(row => row.hits)).toEqual([2, 3, 5]);
      } finally {
        await db.execute(sql`DELETE FROM customer_auth_limits WHERE bucket IN (${buckets[0]},${buckets[1]},${buckets[2]})`);
      }
    });

    it("recovers only an owned failed order and retains its original request identity", async () => {
      const placed = await createOrder();
      const key = randomUUID(), body = { reservationId: randomUUID(), orderNumber: "test-stored-body" };
      const inserted = await db.execute(sql`INSERT INTO apna_outbox(order_id,operation,request_key,body,attempts,last_error) VALUES(${placed.orderId},'commit',${key},${JSON.stringify(body)},8,'Connection unavailable') RETURNING id`);
      const id = inserted.rows[0].id;
      try {
        await expect(db.transaction(tx => retryOrderSync(tx, placed.orderId, shopId + 100000))).rejects.toMatchObject({ code: "NOT_FOUND" });
        const result = await db.transaction(tx => retryOrderSync(tx, placed.orderId, shopId));
        expect(result).toEqual({ queued: true });
        const row = (await db.execute(sql`SELECT * FROM apna_outbox WHERE id=${id}`)).rows[0];
        expect(row.attempts).toBe(0); expect(row.request_key).toBe(key); expect(row.body).toEqual(body);
        expect(await db.transaction(tx => retryOrderSync(tx, placed.orderId, shopId))).toEqual({ queued: false });
      } finally { await db.execute(sql`DELETE FROM apna_outbox WHERE id=${id}`); }
    });

    it("pages private order history and finds only the caller's lost checkout submission", async () => {
      const placed = await createOrder();
      const row = (await db.select().from(orders).where(eq(orders.id, placed.orderId)))[0];
      expect(await caller(customer).marketplace.checkoutSubmission({ key: row.idempotencyKey })).toEqual({ id: row.id });
      expect(await caller(vendorUser).marketplace.checkoutSubmission({ key: row.idempotencyKey })).toBeNull();
      const history = await caller(customer).marketplace.orderHistory({ limit: 1 });
      expect(history.orders).toHaveLength(1);
      expect(history.orders[0].order.customerId).toBe(customer.id);
      if (history.nextCursor) {
        const next = await caller(customer).marketplace.orderHistory({ cursor: history.nextCursor, limit: 1 });
        expect(next.orders.every(item => item.order.id < history.nextCursor! && item.order.customerId === customer.id)).toBe(true);
      }
      await expect(caller(null).marketplace.orderHistory({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("keeps accepted GST per-line rounding and tax snapshots stable across catalogue changes", async () => {
      const fixture = await catalogFixture();
      const tax = { schema: 1 as const, netUnitPaise: 3, offerNetUnitPaise: null, gstBps: 500, hsn: "FICTITIOUS" };
      await db.update(products).set({ pricePaise: 3, stockQuantity: 200, taxMeta: tax }).where(eq(products.id, fixture.productId));
      const input = { ...fixture.scope, shopId: fixture.shopId, idempotencyKey: `gst_${randomUUID()}`, items: [{ productId: fixture.productId, quantity: 100 }], fulfillmentType: "pickup" as const, paymentMethod: "pickup" as const };
      const api = caller(customer).marketplace;
      const quote = await api.quoteOrder(input);
      expect(quote.items[0].lineTotalPaise).toBe(315);
      expect(quote.totals).toMatchObject({ subtotalPaise: 315, taxPaise: 15, totalPaise: 315 });
      const order = await api.placeOrder({ ...input, quoteFingerprint: quote.quoteFingerprint });
      const detail = await api.orderDetail({ orderId: order.orderId });
      expect(detail.order.taxPaise).toBe(15); expect(detail.items[0].lineTotalPaise).toBe(315);
      expect(detail.items[0].taxSnapshot).toMatchObject({ gstBps: 500, taxablePaise: 300, taxPaise: 15, totalPaise: 315 });
      await db.update(products).set({ taxMeta: { ...tax, gstBps: 1000 } }).where(eq(products.id, fixture.productId));
      const replay = await api.placeOrder({ ...input, quoteFingerprint: quote.quoteFingerprint });
      expect(replay.orderId).toBe(order.orderId);
      const changed = { ...input, idempotencyKey: `gst_change_${randomUUID()}` };
      await expect(api.placeOrder({ ...changed, quoteFingerprint: quote.quoteFingerprint })).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await api.orderDetail({ orderId: order.orderId })).order.totalPaise).toBe(315);
    });

    it("stops automatic order dispatch after eight failures and resumes the identical owned request", async () => {
      const { fixture, input } = await quotedFixture();
      const order = await caller(customer).marketplace.placeOrder(input);
      const merchant = randomUUID(), key = randomUUID(), reference = randomUUID(), reservationId = randomUUID();
      const body = { merchantId: merchant, reservationId, orderNumber: "MTM-ISOLATED-RETRY", revision: "1.2-sandbox" };
      await db.execute(sql`INSERT INTO apna_links(merchant_id,vendor_id,version,live,expires_at,verified_at) VALUES(${merchant},${fixture.shopId},1,true,now()+interval '1 day',now())`);
      await db.execute(sql`INSERT INTO apna_checkouts(reference,merchant_id,vendor_id,request_key,body,response,order_id,state) VALUES(${reference},${merchant},${fixture.shopId},${key},${JSON.stringify(body)},${JSON.stringify({ reservationId })},${order.orderId},'HOLD')`);
      await db.execute(sql`INSERT INTO apna_outbox(order_id,operation,request_key,body) VALUES(${order.orderId},'commit',${key},${JSON.stringify(body)}),(${order.orderId},'sale',${randomUUID()},${JSON.stringify(body)})`);
      const post = vi.spyOn(SignedSandboxTransport.prototype, "post").mockRejectedValue(Error("Isolated simulated peer outage"));
      vi.stubEnv("MTM_APNA_SANDBOX_ENABLED", "1"); vi.stubEnv("HOST", "127.0.0.1"); vi.stubEnv("APNA_SANDBOX_URL", "https://localhost:8465/"); vi.stubEnv("APNA_SANDBOX_KEY", "fixture-key-".repeat(6)); vi.stubEnv("APNA_SANDBOX_SECRET", "fixture-secret-".repeat(6));
      try {
        for (let attempt = 1; attempt <= 8; attempt++) {
          await db.execute(sql`UPDATE apna_outbox SET next_at=now() WHERE order_id=${order.orderId}`);
          expect(await relayApnaOutbox()).toBe(1);
          const row = (await db.execute(sql`SELECT attempts FROM apna_outbox WHERE order_id=${order.orderId} AND operation='commit'`)).rows[0];
          expect(row.attempts).toBe(attempt);
        }
        await db.execute(sql`UPDATE apna_outbox SET next_at=now() WHERE order_id=${order.orderId}`);
        expect(await relayApnaOutbox()).toBe(0); expect(post).toHaveBeenCalledTimes(8);
        expect(await db.transaction(tx => retryOrderSync(tx, order.orderId, fixture.shopId))).toEqual({ queued: true });
        post.mockResolvedValue({ success: true }); await relayApnaOutbox();
        expect(post.mock.calls.every(call => call[2] === key && call[1].reservationId === reservationId)).toBe(true);
        expect((await db.execute(sql`SELECT state FROM apna_checkouts WHERE order_id=${order.orderId}`)).rows[0].state).toBe("COMMITTED");
      } finally {
        post.mockRestore(); vi.unstubAllEnvs();
        await db.execute(sql`DELETE FROM apna_outbox WHERE order_id=${order.orderId}`);
        await db.execute(sql`DELETE FROM apna_checkouts WHERE reference=${reference}`);
        await db.execute(sql`DELETE FROM apna_links WHERE merchant_id=${merchant}`);
      }
    });

    it("replaces a 500-item catalogue atomically without changing existing published IDs", async () => {
      const fixture = await catalogFixture(), merchant = randomUUID();
      const items = Array.from({ length: 500 }, (_, index) => ({ sku: `bulk-${index}`, name: `Fictional bulk item ${index}`, unit: "pc", pricePaise: 118, quantity: 10, tax: { schema: 1 as const, netUnitPaise: 100, offerNetUnitPaise: null, gstBps: 1800, hsn: "TEST" } }));
      await db.transaction(tx => writeCatalogueProducts(tx, fixture.shopId, merchant, items, false));
      const before = await db.execute(sql`SELECT sku,product_id FROM apna_products WHERE vendor_id=${fixture.shopId} ORDER BY sku`);
      expect(before.rows).toHaveLength(500);
      const tailId = Number(before.rows.at(-1)!.product_id);
      const reordered = await caller(null).marketplace.browse({ ...fixture.scope, shopId: fixture.shopId, productIds: [tailId], limit: 50 });
      expect(reordered.products.map(product => product.id)).toEqual([tailId]);
      await db.transaction(tx => writeCatalogueProducts(tx, fixture.shopId, merchant, items.map(item => ({ ...item, quantity: 9 })), false));
      const after = await db.execute(sql`SELECT sku,product_id FROM apna_products WHERE vendor_id=${fixture.shopId} ORDER BY sku`);
      expect(after.rows).toEqual(before.rows);
      await expect(db.transaction(tx => writeCatalogueProducts(tx, fixture.shopId, merchant, [{ ...items[0], name: "x".repeat(181) }], false))).rejects.toThrow();
      expect((await db.select().from(products).where(and(eq(products.vendorId, fixture.shopId), eq(products.availability, "available"))))).toHaveLength(500);
      await db.transaction(tx => writeCatalogueProducts(tx, fixture.shopId, merchant, [], false));
      expect((await db.select().from(products).where(and(eq(products.vendorId, fixture.shopId), eq(products.availability, "available"))))).toHaveLength(0);
    });

    async function catalogFixture() {
      const suffix = randomUUID();
      const [zone] = await db.insert(serviceZones).values({ townId, slug: `catalog-${suffix}`, name: "Isolated catalog", locality: "Isolated catalog", active: true }).returning({ insertId: serviceZones.id });
      const categoryIds: number[] = [];
      for (const kind of ["shop", "product"]) {
        const [category] = await db.insert(categories).values({ slug: `${kind}-${suffix}`, name: `Isolated ${kind}`, enabled: true, regulated: false }).returning({ insertId: categories.id });
        categoryIds.push(Number(category.insertId));
      }
      const [shop] = await db.insert(vendorProfiles).values({ townId, zoneId: Number(zone.insertId), categoryId: categoryIds[0], slug: `catalog-${suffix}`, shopName: "Isolated catalog shop", address: "Fictional test address", status: "approved", isOpen: true, isDemo: true, pickupEnabled: true }).returning({ insertId: vendorProfiles.id });
      const [product] = await db.insert(products).values({ vendorId: Number(shop.insertId), categoryId: categoryIds[1], slug: `product-${suffix}`, name: "Isolated cross-category product", unit: "piece", pricePaise: 1299, stockQuantity: 4, availability: "available", isDemo: true }).returning({ insertId: products.id });
      return { scope: { townId, zoneId: Number(zone.insertId) }, shopId: Number(shop.insertId), productId: Number(product.insertId), shopCategory: categoryIds[0], productCategory: categoryIds[1] };
    }

    function catalogOrder(fixture: Awaited<ReturnType<typeof catalogFixture>>, key: string) {
      return caller(customer).marketplace.placeOrder({ ...fixture.scope, shopId: fixture.shopId, idempotencyKey: key, items: [{ productId: fixture.productId, quantity: 1 }], fulfillmentType: "pickup", paymentMethod: "pickup" });
    }

    async function quotedFixture(quantity = 1) {
      const fixture = await catalogFixture();
      const input = {
        ...fixture.scope, shopId: fixture.shopId, idempotencyKey: `quote_${randomUUID()}`,
        items: [{ productId: fixture.productId, quantity }],
        fulfillmentType: "pickup" as const, paymentMethod: "pickup" as const,
      };
      const quote = await caller(customer).marketplace.quoteOrder(input);
      return { fixture, input: { ...input, quoteFingerprint: quote.quoteFingerprint }, quote };
    }

    async function expectNoCheckoutEffects(key: string, productId: number, stock: number) {
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
      for (const table of [paymentRecords, financialLedger, orderItems, orderEvents]) {
        expect(await db.select().from(table).innerJoin(orders, eq(table.orderId, orders.id)).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
      }
      const [product] = await db.select().from(products).where(eq(products.id, productId));
      expect(product.stockQuantity).toBe(stock);
    }

    it("pages the complete public catalogue without duplicates and preserves area/category boundaries", async () => {
      const fixture = await catalogFixture();
      await db.insert(products).values(
        Array.from({ length: 57 }, (_, index) => ({
          vendorId: fixture.shopId,
          categoryId: fixture.productCategory,
          slug: `page-${randomUUID()}`,
          name: `Pagination product ${index}`,
          unit: "piece",
          pricePaise: 1000 + (index % 4) * 100,
          stockQuantity: index === 56 ? 0 : 2,
          availability: "available" as const,
          isDemo: true,
        }))
      );
      const api = caller(null).marketplace;
      let cursor: { id: number; price: number } | undefined;
      const ids: number[] = [],
        prices: number[] = [];
      for (let page = 0; page < 5; page++) {
        const result = await api.browse({
          ...fixture.scope,
          kind: "products",
          sort: "low",
          limit: 24,
          cursor,
        });
        expect(result.products.length).toBeLessThanOrEqual(24);
        ids.push(...result.products.map(product => product.id));
        prices.push(...result.products.map(product => product.pricePaise));
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      expect(ids).toHaveLength(57);
      expect(new Set(ids).size).toBe(ids.length);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      const all = await api.browse({
        ...fixture.scope,
        kind: "products",
        onlyStock: false,
        limit: 50,
      });
      expect(all.products).toHaveLength(50);
      expect(all.nextCursor).not.toBeNull();
      const foreign = await api.browse({
        townId,
        zoneId: otherZoneId,
        shopId: fixture.shopId,
      });
      expect(foreign.products).toEqual([]);
      await db
        .update(vendorProfiles)
        .set({ isOpen: false })
        .where(eq(vendorProfiles.id, fixture.shopId));
      expect((await api.browse({ ...fixture.scope })).products).toEqual([]);
      await expect(
        api.browse({ ...fixture.scope, limit: 5000 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    beforeAll(async () => {
      if (!integrationEnabled) return;
      const connected = await getDb();
      if (!connected) throw new Error("Isolated MySQL test database is unavailable");
      db = connected;
      const [town] = await db.select().from(towns).where(eq(towns.active, true)).limit(1);
      if (!town) throw new Error("Seed the disposable DB with pnpm db:seed-demo first");
      townId = town.id;
      const [zone] = await db.select().from(serviceZones).where(and(eq(serviceZones.townId, townId), eq(serviceZones.active, true))).limit(1);
      const [category] = await db.select().from(categories).where(and(eq(categories.enabled, true), eq(categories.regulated, false))).limit(1);
      if (!zone || !category) throw new Error("Active town, zone and non-regulated category are required");
      zoneId = zone.id;
      const [otherZone] = await db.insert(serviceZones).values({
        townId,
        slug: `e2e-other-${randomUUID().slice(0, 8)}`,
        name: "Isolated other area",
        locality: "Different Test Locality",
        postalCode: "00000",
        active: true,
      }).returning({ insertId: serviceZones.id });
      otherZoneId = Number(otherZone.insertId);
      categoryId = category.id;
      vendorUser = await createUser("vendor");
      customer = await createUser("customer");
      admin = await createUser("admin", "admin");
      rider = await createUser("rider");
      const [shopResult] = await db.insert(vendorProfiles).values({
        userId: vendorUser.id,
        townId,
        zoneId,
        categoryId,
        slug: `e2e-${randomUUID()}`,
        shopName: `Isolated test shop ${randomUUID().slice(0, 8)}`,
        address: "3 Localhost Road",
        phone: "+919999000004",
        status: "approved",
        isOpen: true,
        isDemo: false,
        deliveryEnabled: true,
        pickupEnabled: true,
        deliveryFeePaise: 250,
        platformFeePaise: 50,
        minimumOrderPaise: 0,
        commissionBps: 500,
      }).returning({ insertId: vendorProfiles.id });
      shopId = Number(shopResult.insertId);
      const [riderResult] = await db.insert(riderProfiles).values({
        userId: rider.id,
        townId,
        phone: "+919999000001",
        vehicleType: "bicycle",
        status: "approved",
        available: true,
      }).returning({ insertId: riderProfiles.id });
      riderId = Number(riderResult.insertId);
      const [addressResult] = await db.insert(customerAddresses).values({
        userId: customer.id,
        townId,
        zoneId,
        label: "Test home",
        recipientName: "Isolated customer",
        phone: "+919999000002",
        line1: "1 Localhost Road",
        line2: null,
        landmark: null,
        postalCode: zone.postalCode,
        isDefault: true,
      }).returning({ insertId: customerAddresses.id });
      customerAddressId = Number(addressResult.insertId);
      productsByKey = {
        duplicate: await addProduct("duplicate"),
        delivery: await addProduct("delivery"),
        pickup: await addProduct("pickup"),
        second: await addProduct("second"),
      };
    }, 30_000);

    afterAll(async () => {
      if (db) await db.$client.end();
    });

    it("persists a published shop's pincode, reuses its area and preserves disabled service areas", async () => {
      const shop = {city:`Isolated town ${randomUUID()}`,state:"Test State",postalCode:"458226"};
      const publish = () => db.transaction(tx=>provisionPublishedLocation(tx,shop));
      const first = await publish();
      const [zone] = await db.select().from(serviceZones).where(eq(serviceZones.id,first.zoneId));
      expect(zone.postalCode).toBe("458226");
      expect(await publish()).toEqual(first);
      const other = await db.transaction(tx=>provisionPublishedLocation(tx,{...shop,city:`Other ${shop.city}`}));
      expect(other.townId).not.toBe(first.townId); expect(other.zoneId).not.toBe(first.zoneId);
      await db.update(serviceZones).set({active:false}).where(eq(serviceZones.id,first.zoneId));
      await publish();
      const [disabled] = await db.select().from(serviceZones).where(eq(serviceZones.id,first.zoneId));
      expect(disabled.active).toBe(false);
    });

    it("requires a fresh live ERP link and mapped non-demo products for connected checkout", async () => {
      const f = await catalogFixture();
      const merchant = randomUUID();
      const input = { ...f.scope, shopId: f.shopId, items: [{productId:f.productId,quantity:1}], fulfillmentType:"pickup" as const, paymentMethod:"pickup" as const };
      vi.stubEnv("MTM_APNA_CONNECTOR_MODE", "production");
      try {
        const quote = () => db.transaction(tx => prepareCheckout(tx,input,customer));
        const sellers = () => db.select({id:vendorProfiles.id}).from(vendorProfiles).where(and(eq(vendorProfiles.id,f.shopId),publishedSellerCondition(vendorProfiles.id,vendorProfiles.isDemo)));
        const visibleProducts = () => db.select({id:products.id}).from(products).where(and(eq(products.id,f.productId),publishedProductCondition(products.id,products.vendorId,products.isDemo)));
        expect(await sellers()).toHaveLength(0);
        await expect(quote()).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
        await db.execute(sql`INSERT INTO apna_links(merchant_id,vendor_id,version,live,expires_at,verified_at) VALUES(${merchant},${f.shopId},1,true,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+INTERVAL '1 hour',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))`);
        // Fictional data stays invisible in production even with a link.
        expect(await sellers()).toHaveLength(0);
        await db.update(vendorProfiles).set({isDemo:false}).where(eq(vendorProfiles.id,f.shopId));
        expect(await sellers()).toHaveLength(1);
        expect(await visibleProducts()).toHaveLength(0);
        await db.update(products).set({isDemo:false}).where(eq(products.id,f.productId));
        expect(await visibleProducts()).toHaveLength(0);
        await db.execute(sql`INSERT INTO apna_products(product_id,vendor_id,sku) VALUES(${f.productId},${f.shopId},'test-sku')`);
        expect(await visibleProducts()).toHaveLength(1);
        expect((await quote()).quote.totals.totalPaise).toBe(1299);
        for(const change of [sql`verified_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-INTERVAL '30 seconds'`,sql`verified_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),live=false`,sql`live=true,expires_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-INTERVAL '1 second'`]) {
          await db.execute(sql`UPDATE apna_links SET ${change} WHERE merchant_id=${merchant}`);
          expect(await sellers()).toHaveLength(0);
          await expect(quote()).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
        }
        // Local connected fixtures keep their explicit demo labels.
        await db.execute(sql`UPDATE apna_links SET live=true,expires_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')+INTERVAL '1 hour',verified_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE merchant_id=${merchant}`);
        await db.update(vendorProfiles).set({isDemo:true}).where(eq(vendorProfiles.id,f.shopId));
        await db.update(products).set({isDemo:true}).where(eq(products.id,f.productId));
        vi.stubEnv("MTM_APNA_CONNECTOR_MODE", ""); vi.stubEnv("MTM_APNA_SANDBOX_ENABLED", "1");
        expect(await sellers()).toHaveLength(1); expect(await visibleProducts()).toHaveLength(1);
      } finally { vi.unstubAllEnvs(); }
    });

    it("requires a reviewed quote before any checkout effects", async () => {
      const fixture = await catalogFixture();
      const key = `unconfirmed_${randomUUID()}`;
      await expect(catalogOrder(fixture, key)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
      const [product] = await db.select().from(products).where(eq(products.id, fixture.productId));
      expect(product.stockQuantity).toBe(4);
    });

    it("labels products created by a fictional merchant as demo listings", async () => {
      await db.update(vendorProfiles).set({ isDemo: true }).where(eq(vendorProfiles.id, shopId));
      try {
        const result = await caller(vendorUser).vendor.createProduct({ categoryId, name: `Demo-labelled ${randomUUID()}`, unit: "piece", pricePaise: 1200, stockQuantity: 4 });
        const [product] = await db.select().from(products).where(eq(products.id, result.id));
        expect(product.isDemo).toBe(true);
      } finally {
        await db.update(vendorProfiles).set({ isDemo: false }).where(eq(vendorProfiles.id, shopId));
      }
    });

    it("rejects idempotency reuse with changed checkout content", async () => {
      const key = `conflicting_${randomUUID()}`;
      const product = await addProduct("conflicting-key");
      const first = await createOrder(caller(customer), product, "pickup", key);
      await expect(caller(customer).marketplace.placeOrder({
        idempotencyKey: key, shopId, townId, zoneId,
        items: [{ productId: product.id, quantity: 2 }],
        fulfillmentType: "pickup", paymentMethod: "pickup",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, key))).toHaveLength(1);
      expect(first.orderId).toBeGreaterThan(0);
    });

    it.each(["price", "delivery fee", "platform fee"])("requires explicit reconfirmation after a changed %s and writes nothing on rejection", async change => {
      const { fixture, input, quote } = await quotedFixture();
      // Exercise a real delivery fee as well as pickup pricing.
      if (change === "delivery fee") {
        const product = await addProduct("delivery-fee-quote");
        const deliveryInput = { ...input, shopId, townId, zoneId, items: [{ productId: product.id, quantity: 1 }], fulfillmentType: "delivery" as const, paymentMethod: "cod" as const, addressId: customerAddressId };
        const before = await caller(customer).marketplace.quoteOrder(deliveryInput);
        await db.update(vendorProfiles).set({ deliveryFeePaise: 350 }).where(eq(vendorProfiles.id, shopId));
        try {
          await expect(caller(customer).marketplace.placeOrder({ ...deliveryInput, quoteFingerprint: before.quoteFingerprint })).rejects.toMatchObject({ code: "CONFLICT" });
          await expectNoCheckoutEffects(input.idempotencyKey, product.id, product.stock);
        } finally {
          await db.update(vendorProfiles).set({ deliveryFeePaise: 250 }).where(eq(vendorProfiles.id, shopId));
        }
        return;
      }
      if (change === "price") await db.update(products).set({ pricePaise: 1599 }).where(eq(products.id, fixture.productId));
      else await db.update(vendorProfiles).set({ platformFeePaise: 200 }).where(eq(vendorProfiles.id, fixture.shopId));
      await expect(caller(customer).marketplace.placeOrder(input)).rejects.toMatchObject({ code: "CONFLICT" });
      await expectNoCheckoutEffects(input.idempotencyKey, fixture.productId, 4);
      const updated = await caller(customer).marketplace.quoteOrder(input);
      expect(updated.quoteFingerprint).not.toBe(quote.quoteFingerprint);
      const result = await caller(customer).marketplace.placeOrder({ ...input, quoteFingerprint: updated.quoteFingerprint });
      const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
      expect(order.totalPaise).toBe(updated.totals.totalPaise);
    });

    it.each(["unavailable", "stock", "merchant", "shop category", "product category", "locality", "fulfillment"])("rejects a previously quoted cart after %s changes without partial effects", async change => {
      const { fixture, input } = await quotedFixture(2);
      let expectedStock = 4;
      if (change === "unavailable") await db.update(products).set({ availability: "unavailable" }).where(eq(products.id, fixture.productId));
      if (change === "stock") { await db.update(products).set({ stockQuantity: 1 }).where(eq(products.id, fixture.productId)); expectedStock = 1; }
      if (change === "merchant") await db.update(vendorProfiles).set({ status: "suspended" }).where(eq(vendorProfiles.id, fixture.shopId));
      if (change === "shop category") await db.update(categories).set({ enabled: false }).where(eq(categories.id, fixture.shopCategory));
      if (change === "product category") await db.update(categories).set({ enabled: false }).where(eq(categories.id, fixture.productCategory));
      if (change === "locality") await db.update(serviceZones).set({ active: false }).where(eq(serviceZones.id, fixture.scope.zoneId));
      if (change === "fulfillment") await db.update(vendorProfiles).set({ pickupEnabled: false }).where(eq(vendorProfiles.id, fixture.shopId));
      const code = change === "stock" ? "CONFLICT" : ["unavailable", "product category"].includes(change) ? "BAD_REQUEST" : "PRECONDITION_FAILED";
      await expect(caller(customer).marketplace.placeOrder(input)).rejects.toMatchObject({ code });
      await expect(caller(customer).marketplace.quoteOrder(input)).rejects.toMatchObject({ code });
      await expectNoCheckoutEffects(input.idempotencyKey, fixture.productId, expectedStock);
    });

    it("quotes and checks out unchanged prices once, including concurrent last-unit retries and later catalogue changes", async () => {
      const { fixture, input, quote } = await quotedFixture(4);
      expect(quote.totals.totalPaise).toBe(1299 * 4);
      expect(quote).not.toHaveProperty("commissionPaise");
      const results = await Promise.all([caller(customer).marketplace.placeOrder(input), caller(customer).marketplace.placeOrder(input)]);
      expect(results[0].orderId).toBe(results[1].orderId);
      expect(results.filter(r => r.duplicate)).toHaveLength(1);
      await db.update(products).set({ availability: "archived", pricePaise: 1800 }).where(eq(products.id, fixture.productId));
      expect((await caller(customer).marketplace.placeOrder(input)).orderId).toBe(results[0].orderId);
      expect((await caller(customer).marketplace.placeOrder({ ...input, quoteFingerprint: undefined })).orderId).toBe(results[0].orderId);
      for (const changed of [
        { notes: "changed" }, { substitutionPreference: "changed" },
        { zoneId }, { addressId: customerAddressId },
        { fulfillmentType: "delivery" as const, paymentMethod: "cod" as const },
        { items: [{ productId: fixture.productId, quantity: 1 }] },
      ]) await expect(caller(customer).marketplace.placeOrder({ ...input, ...changed })).rejects.toMatchObject({ code: "CONFLICT" });
      const orderId = results[0].orderId;
      expect(await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))).toHaveLength(1);
      expect(await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, orderId))).toHaveLength(1);
      expect(await db.select().from(financialLedger).where(eq(financialLedger.orderId, orderId))).toHaveLength(2);
    });

    it("rejects duplicate product lines and mixed-seller carts during quotation", async () => {
      const { fixture, input } = await quotedFixture();
      for (const productId of [fixture.productId, productsByKey.delivery.id]) {
        await expect(caller(customer).marketplace.quoteOrder({ ...input, items: [...input.items, { productId, quantity: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      await expectNoCheckoutEffects(input.idempotencyKey, fixture.productId, 4);
    });

    it("does not oversell when different customers concurrently submit valid quotes for the last stock", async () => {
      for (let round = 0; round < 5; round++) {
        const { fixture, input } = await quotedFixture(4);
        const other = caller(await createUser("competing-customer"));
        const otherIntent = { ...input, idempotencyKey: `competing_${randomUUID()}` };
        const otherQuote = await other.marketplace.quoteOrder(otherIntent);
        const results = await Promise.allSettled([
          caller(customer).marketplace.placeOrder(input),
          other.marketplace.placeOrder({ ...otherIntent, quoteFingerprint: otherQuote.quoteFingerprint }),
        ]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.findIndex(result => result.status === "rejected");
        const reason = (results[rejected] as PromiseRejectedResult).reason;
        expect(results[rejected], `Underlying database code: ${reason.cause?.cause?.code ?? reason.cause?.code ?? "none"}`)
          .toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
        await expectNoCheckoutEffects(rejected === 0 ? input.idempotencyKey : otherIntent.idempotencyKey, fixture.productId, 0);
      }
    });

    it("requires reconfirmation after editing a saved delivery address and keeps addresses owner-scoped", async () => {
      const product = await addProduct("edited-address-quote");
      const owner = caller(await createUser("quote-address-owner"));
      const [address] = await db.insert(customerAddresses).values({ userId: (await owner.auth.me())!.id, townId, zoneId, label: "Quote address", recipientName: "Isolated customer", phone: "9999900000", line1: "Original fictional address" }).returning({ insertId: customerAddresses.id });
      const input = { idempotencyKey: `address_${randomUUID()}`, shopId, townId, zoneId, addressId: Number(address.insertId), items: [{ productId: product.id, quantity: 1 }], fulfillmentType: "delivery" as const, paymentMethod: "cod" as const };
      const quote = await owner.marketplace.quoteOrder(input);
      expect(quote).toHaveProperty("address.line1", "Original fictional address");
      expect(quote).not.toHaveProperty("address.userId");
      const stranger = await createUser("address-stranger");
      await expect(caller(stranger).marketplace.quoteOrder(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await db.update(customerAddresses).set({ line1: "Changed fictional address" }).where(eq(customerAddresses.id, input.addressId));
      await expect(owner.marketplace.placeOrder({ ...input, quoteFingerprint: quote.quoteFingerprint })).rejects.toMatchObject({ code: "CONFLICT" });
      await expectNoCheckoutEffects(input.idempotencyKey, product.id, product.stock);
      const updated = await owner.marketplace.quoteOrder(input);
      expect(updated).toHaveProperty("address.line1", "Changed fictional address");
      expect(updated.totals).toEqual(quote.totals);
      expect(updated.quoteFingerprint).not.toBe(quote.quoteFingerprint);
      await expect(owner.marketplace.placeOrder({ ...input, quoteFingerprint: updated.quoteFingerprint })).resolves.toMatchObject({ duplicate: false });
    });

    it("keeps the default address unchanged when an address update is rejected", async () => {
      const owner = caller(await createUser("def-own"));
      const stranger = caller(await createUser("def-other"));
      const values = { townId, zoneId, label: "Home", recipientName: "Isolated customer", phone: "9999900000", line1: "Fictional address", isDefault: true };
      const own = await owner.account.saveAddress(values);
      const foreign = await stranger.account.saveAddress(values);
      await expect(owner.account.saveAddress({ ...values, id: foreign.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await owner.account.addresses()).toEqual(expect.arrayContaining([expect.objectContaining({ id: own.id, isDefault: true })]));
      expect(await stranger.account.addresses()).toEqual(expect.arrayContaining([expect.objectContaining({ id: foreign.id, isDefault: true })]));
    });

    it("serializes concurrent default address changes for one customer", async () => {
      const owner = caller(await createUser("def-race"));
      const values = { townId, zoneId, label: "Home", recipientName: "Isolated customer", phone: "9999900000", line1: "Fictional address", isDefault: true };
      await Promise.all([owner.account.saveAddress(values), owner.account.saveAddress({ ...values, label: "Work" })]);
      const addresses = await owner.account.addresses();
      expect(addresses).toHaveLength(2);
      expect(addresses.filter(address => address.isDefault)).toHaveLength(1);
    });

    it("fails closed on retrying legacy orders without a stored request fingerprint", async () => {
      const { input } = await quotedFixture();
      const created = await caller(customer).marketplace.placeOrder(input);
      await db.update(orderEvents).set({ metadata: null }).where(and(eq(orderEvents.orderId, created.orderId), eq(orderEvents.toStatus, "placed")));
      await expect(caller(customer).marketplace.placeOrder(input)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("order history") });
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey))).toHaveLength(1);
    });

    it("minimizes public DTOs, binds browsing to the exact selected active zone, and denies private routes", async () => {
      const publicCaller = caller(null);
      const shop = await publicCaller.marketplace.shop({ shopId, townId, zoneId });
      const product = await publicCaller.marketplace.product({ productId: productsByKey.delivery.id, townId, zoneId });
      const home = await publicCaller.marketplace.home({ townId, zoneId });
      const search = await publicCaller.marketplace.search({ townId, zoneId });
      expect(home.shops.some(row => row.id === shopId)).toBe(true);
      expect(search.shops.some(row => row.id === shopId)).toBe(true);
      expect(shop).toHaveProperty("townId", townId);
      expect(shop).toHaveProperty("zoneId", zoneId);
      expect(shop).not.toHaveProperty("userId");
      expect(shop).not.toHaveProperty("commissionBps");
      expect(shop).not.toHaveProperty("settings");
      expect(product).toHaveProperty("inStock", true);
      expect(product).not.toHaveProperty("stockQuantity");
      expect(product.shop).not.toHaveProperty("phone");
      await expect(publicCaller.marketplace.shop({ shopId, townId, zoneId: otherZoneId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(publicCaller.marketplace.product({ productId: productsByKey.delivery.id, townId, zoneId: otherZoneId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(publicCaller.marketplace.home({ townId, zoneId: otherZoneId })).resolves.toMatchObject({ shops: [] });
      await expect(publicCaller.marketplace.shop({ shopId, townId: townId + 99999, zoneId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller(customer).admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(customer).vendor.products()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(customer).account.addresses()).resolves.toHaveLength(1);
    });

    it("finds a product by its own category even when its shop has another primary category", async () => {
      const fixture = await catalogFixture();
      const found = await caller(null).marketplace.search({ ...fixture.scope, categoryId: fixture.productCategory });
      expect(found.products.map(product => product.id)).toContain(fixture.productId);
      const detail = await caller(null).marketplace.product({ ...fixture.scope, productId: fixture.productId });
      expect(found.products.find(product => product.id === fixture.productId)?.pricePaise).toBe(detail.pricePaise);
    });

    it.each(["disabled", "regulated"] as const)("excludes %s product categories consistently and rejects checkout without stock or money writes", async restriction => {
      const fixture = await catalogFixture();
      await db.update(categories).set(restriction === "disabled" ? { enabled: false } : { regulated: true }).where(eq(categories.id, fixture.productCategory));
      const publicCaller = caller(null);
      const home = await publicCaller.marketplace.home(fixture.scope);
      const search = await publicCaller.marketplace.search(fixture.scope);
      const shop = await publicCaller.marketplace.shop({ ...fixture.scope, shopId: fixture.shopId });
      for (const listings of [home.products, search.products, shop.products]) expect(listings.map(product => product.id)).not.toContain(fixture.productId);
      await expect(publicCaller.marketplace.product({ ...fixture.scope, productId: fixture.productId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const key = `restricted_${randomUUID()}`;
      await expect(catalogOrder(fixture, key)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [product] = await db.select().from(products).where(eq(products.id, fixture.productId));
      expect(product.stockQuantity).toBe(4);
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
      expect(await db.select().from(financialLedger).innerJoin(orders, eq(financialLedger.orderId, orders.id)).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
      expect(await db.select().from(paymentRecords).innerJoin(orders, eq(paymentRecords.orderId, orders.id)).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
    });

    it.each(["disabled", "regulated"] as const)("rejects product detail and checkout when the shop category becomes %s", async restriction => {
      const fixture = await catalogFixture();
      await db.update(categories).set(restriction === "disabled" ? { enabled: false } : { regulated: true }).where(eq(categories.id, fixture.shopCategory));
      await expect(caller(null).marketplace.product({ ...fixture.scope, productId: fixture.productId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const key = `restricted_shop_${randomUUID()}`;
      await expect(catalogOrder(fixture, key)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const [product] = await db.select().from(products).where(eq(products.id, fixture.productId));
      expect(product.stockQuantity).toBe(4);
      expect(await db.select().from(orders).where(eq(orders.idempotencyKey, key))).toHaveLength(0);
    });

    it("rejects a checkout from a different selected service area for delivery", async () => {
      const fixture = await catalogFixture();
      await expect(caller(customer).marketplace.placeOrder({ shopId: fixture.shopId, townId, zoneId, idempotencyKey: `wrong_zone_${randomUUID()}`, items: [{ productId: fixture.productId, quantity: 1 }], fulfillmentType: "delivery", paymentMethod: "cod", addressId: customerAddressId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const [product] = await db.select().from(products).where(eq(products.id, fixture.productId));
      expect(product.stockQuantity).toBe(4);
    });

    it("keeps favorites private and scopes support messages to the customer and admins", async () => {
      const customerCaller = caller(customer);
      const stranger = await createUser("stranger");
      const strangerCaller = caller(stranger);
      await customerCaller.marketplace.toggleFavorite({ shopId, townId, zoneId, favorited: true });
      expect((await customerCaller.marketplace.favoriteShops({ townId, zoneId })).map(row => row.id)).toContain(shopId);
      expect(await strangerCaller.marketplace.favoriteShops({ townId, zoneId })).toHaveLength(0);
      await customerCaller.marketplace.toggleFavorite({ shopId, townId, zoneId, favorited: false });
      expect(await customerCaller.marketplace.favoriteShops({ townId, zoneId })).toHaveLength(0);

      const created = await customerCaller.support.create({ subject: "Isolated support request", message: "Please help with a test question" });
      expect((await customerCaller.support.mine()).some(row => row.id === created.ticketId)).toBe(true);
      const ownerThread = await customerCaller.support.thread({ ticketId: created.ticketId });
      expect(ownerThread.messages).toHaveLength(1);
      await expect(strangerCaller.support.thread({ ticketId: created.ticketId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(customerCaller.admin.supportThread({ ticketId: created.ticketId })).rejects.toMatchObject({ code: "FORBIDDEN" });

      const adminCaller = caller(admin);
      const queue = await adminCaller.admin.supportTickets({ status: "open" });
      expect(queue.some(row => row.ticket.id === created.ticketId)).toBe(true);
      await adminCaller.admin.replySupport({ ticketId: created.ticketId, message: "Test reply recorded", status: "resolved" });
      const resolved = await customerCaller.support.thread({ ticketId: created.ticketId });
      expect(resolved.ticket.status).toBe("resolved");
      expect(resolved.messages.map(row => row.senderRole)).toEqual(["customer", "admin"]);
      await expect(customerCaller.support.reply({ ticketId: created.ticketId, message: "Reply after resolution" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await db.select().from(auditRecords).where(eq(auditRecords.entityId, created.ticketId))).some(row => row.action === "support.ticket_replied")).toBe(true);
    });

    it("makes retry/concurrent checkout idempotent, snapshots money, and reverses unpaid cancellation atomically", async () => {
      const customerCaller = caller(customer);
      const product = productsByKey.duplicate;
      const key = `e2e_retry_${randomUUID()}`;
      const intent = {
        idempotencyKey: key,
        shopId,
        townId,
        zoneId,
        items: [{ productId: product.id, quantity: 2 }],
        addressId: customerAddressId,
        fulfillmentType: "delivery" as const,
        paymentMethod: "cod" as const,
        notes: "retry invariant",
      };
      const quote = await customerCaller.marketplace.quoteOrder(intent);
      const input = { ...intent, quoteFingerprint: quote.quoteFingerprint };
      const [first, retry] = await Promise.all([
        customerCaller.marketplace.placeOrder(input),
        customerCaller.marketplace.placeOrder(input),
      ]);
      expect(first.orderId).toBe(retry.orderId);
      expect([first.duplicate, retry.duplicate].filter(Boolean)).toHaveLength(1);
      const [order] = await db.select().from(orders).where(eq(orders.id, first.orderId)).limit(1);
      const [payment] = await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, first.orderId)).limit(1);
      expect(order.totalPaise).toBe(1299 * 2 + 250 + 50);
      expect(order.paymentStatus).toBe("pending");
      expect(payment.status).toBe("pending");
      const [afterOrder] = await db.select().from(products).where(eq(products.id, product.id)).limit(1);
      expect(afterOrder.stockQuantity).toBe(48);
      await customerCaller.marketplace.cancelOrder({ orderId: first.orderId, reason: "Test cancelled before fulfilment" });
      await expect(customerCaller.customer.reviewOrder({ orderId: first.orderId, rating: 5 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const [cancelled] = await db.select().from(orders).where(eq(orders.id, first.orderId)).limit(1);
      const [voidedPayment] = await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, first.orderId)).limit(1);
      const ledger = await db.select().from(financialLedger).where(eq(financialLedger.orderId, first.orderId));
      const [restored] = await db.select().from(products).where(eq(products.id, product.id)).limit(1);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.paymentStatus).toBe("voided");
      expect(voidedPayment.status).toBe("voided");
      expect(ledger.every(entry => entry.status === "reversed")).toBe(true);
      expect(restored.stockQuantity).toBe(50);
    });

    it("delivers COD only after the owner-visible code and records a cash variance for admin verification", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);
      const adminCaller = caller(admin);
      const riderCaller = caller(rider);
      const product = productsByKey.delivery;
      const created = await createOrder(customerCaller, product, "delivery");
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "ready" });
      const second = await createOrder(customerCaller, productsByKey.second, "delivery");
      await vendorCaller.vendor.updateOrderStatus({ orderId: second.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: second.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: second.orderId, status: "ready" });
      await adminCaller.admin.assignRider({ orderId: created.orderId, riderId });
      await expect(adminCaller.admin.assignRider({ orderId: second.orderId, riderId })).rejects.toMatchObject({ code: "CONFLICT" });
      await adminCaller.admin.updateOrderStatus({ orderId: second.orderId, status: "cancelled", reason: "Isolated test prevents a second concurrent rider assignment" });
      const live = await riderCaller.rider.deliveries();
      const assigned = live.find(row => row.order?.id === created.orderId);
      if (!assigned) throw new Error("Rider does not see their own assignment");
      expect(assigned).toHaveProperty("customer.phone");
      await riderCaller.rider.updateDelivery({ assignmentId: assigned.assignment.id, action: "accept" });
      await riderCaller.rider.updateDelivery({ assignmentId: assigned.assignment.id, action: "arrived", proof: "At merchant" });
      await riderCaller.rider.updateDelivery({ assignmentId: assigned.assignment.id, action: "picked_up", proof: "Package checked" });
      const orderForCustomer = await customerCaller.marketplace.orderDetail({ orderId: created.orderId });
      const code = orderForCustomer.handoverCode;
      expect(code).toMatch(/^\d{8}$/);
      const badCode = code === "00000000" ? "00000001" : "00000000";
      await expect(riderCaller.rider.updateDelivery({ assignmentId: assigned.assignment.id, action: "delivered", handoverCode: badCode, cashAmountPaise: orderForCustomer.order.totalPaise })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const variance = await riderCaller.rider.updateDelivery({ assignmentId: assigned.assignment.id, action: "delivered", handoverCode: code, cashAmountPaise: orderForCustomer.order.totalPaise - 1, cashNote: "Isolated short-cash variance" });
      expect(variance.cashCollected).toBe(false);
      const [delivered] = await db.select().from(orders).where(eq(orders.id, created.orderId)).limit(1);
      const [payment] = await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, created.orderId)).limit(1);
      expect(delivered.status).toBe("delivered");
      expect(delivered.paymentStatus).toBe("pending");
      expect(payment.collectedAmountPaise).toBe(delivered.totalPaise - 1);
      const reviewedVariance = await adminCaller.admin.reconcileCashCollection({ orderId: created.orderId, verifiedAmountPaise: delivered.totalPaise - 1, reason: "Verified count remains short by one paise" });
      expect(reviewedVariance.collected).toBe(false);
      const reconciled = await adminCaller.admin.reconcileCashCollection({ orderId: created.orderId, verifiedAmountPaise: delivered.totalPaise, reason: "Verified complete amount after recount" });
      expect(reconciled.collected).toBe(true);
      const [collected] = await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, created.orderId)).limit(1);
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, created.orderId)).limit(1);
      const feeLedger = await db.select().from(financialLedger).where(eq(financialLedger.orderId, created.orderId));
      expect(collected.status).toBe("collected");
      expect(collected.collectedAmountPaise).toBe(updatedOrder.totalPaise);
      expect(updatedOrder.paymentStatus).toBe("collected");
      expect(feeLedger.every(entry => entry.status === "recorded")).toBe(true);
      const audits = await db.select().from(auditRecords).where(eq(auditRecords.entityId, created.orderId));
      expect(audits.some(row => row.action === "cash.collection_reconciled")).toBe(true);
      const deliveredDetail = await customerCaller.marketplace.orderDetail({ orderId: created.orderId });
      expect(deliveredDetail.handoverCode).toBeNull();
      await customerCaller.customer.reviewOrder({ orderId: created.orderId, rating: 5, comment: "Local service was clear and prompt" });
      await expect(customerCaller.customer.reviewOrder({ orderId: created.orderId, rating: 4 })).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await customerCaller.marketplace.orderDetail({ orderId: created.orderId })).review).toMatchObject({ rating: 5 });
      const publicShop = await caller(null).marketplace.shop({ shopId, townId, zoneId });
      expect(publicShop.ratingAverage).toBe(5);
      expect(publicShop.ratingCount).toBe(1);
      const stranger = await createUser("review-stranger");
      await expect(caller(stranger).marketplace.orderDetail({ orderId: created.orderId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("completes cash-on-pickup only with the customer's current order code", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);
      const created = await createOrder(customerCaller, productsByKey.pickup, "pickup");
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "ready" });
      const ready = await customerCaller.marketplace.orderDetail({ orderId: created.orderId });
      expect(ready.handoverCode).toMatch(/^\d{8}$/);
      const wrong = ready.handoverCode === "00000000" ? "00000001" : "00000000";
      const adminCaller = caller(admin);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await expect(vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "delivered", handoverCode: wrong, cashAmountPaise: ready.order.totalPaise }))
          .rejects.toMatchObject({ code: attempt === 5 ? "TOO_MANY_REQUESTS" : "BAD_REQUEST" });
      }
      const [locked] = await db.select().from(orders).where(eq(orders.id, created.orderId)).limit(1);
      expect(locked.status).toBe("ready");
      expect(locked.handoverAttempts).toBe(5);
      expect(locked.handoverLockedAt).toBeTruthy();
      expect((await customerCaller.marketplace.orderDetail({ orderId: created.orderId })).handoverCode).toBeNull();
      await expect(vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "delivered", handoverCode: ready.handoverCode!, cashAmountPaise: ready.order.totalPaise })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      await adminCaller.admin.resetHandoverAttempts({ orderId: created.orderId, reason: "Verified pickup customer identity" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "delivered", handoverCode: ready.handoverCode!, cashAmountPaise: ready.order.totalPaise, cashNote: "Exact pickup cash in isolated test" });
      const [payment] = await db.select().from(paymentRecords).where(eq(paymentRecords.orderId, created.orderId)).limit(1);
      expect(payment.status).toBe("collected");
      expect(payment.collectedAmountPaise).toBe(ready.order.totalPaise);
      expect((await caller(admin).admin.cashCollections()).some(row => row.orderId === created.orderId)).toBe(true);
    });

    it.skipIf(!process.env.MYTOWN_ADMIN_EMAIL)("bootstraps the first admin from the protected owner email and leaves other OAuth identities ordinary", async () => {
      const ownerEmail = process.env.MYTOWN_ADMIN_EMAIL!.trim().toLowerCase();
      const ownerOpenId = `e2e-owner-${randomUUID()}`;
      await upsertUser({ openId: ownerOpenId, name: "Isolated owner", email: ownerEmail, loginMethod: "isolated-test-only" });
      const [owner] = await db.select().from(users).where(eq(users.openId, ownerOpenId)).limit(1);
      expect(owner.role).toBe("admin");
      const regularOpenId = `e2e-ordinary-${randomUUID()}`;
      await upsertUser({ openId: regularOpenId, name: "Ordinary test account", email: `ordinary-${randomUUID()}@example.invalid`, loginMethod: "isolated-test-only" });
      const [regular] = await db.select().from(users).where(eq(users.openId, regularOpenId)).limit(1);
      expect(regular.role).toBe("user");
    });

    it("serializes duplicate vendor onboarding so concurrent retries create one application", async () => {
      const applicant = await createUser("applicant");
      const applicantCaller = caller(applicant);
      const input = {
        townId,
        zoneId,
        categoryId,
        shopName: `Concurrent local shop ${randomUUID().slice(0, 8)}`,
        address: "2 Localhost Road",
        phone: "+919999000003",
      };
      const [one, two] = await Promise.all([
        applicantCaller.vendor.register(input),
        applicantCaller.vendor.register(input),
      ]);
      expect(one.id).toBe(two.id);
      expect(one.status).toBe("pending");
      const rows = await db.select().from(vendorProfiles).where(eq(vendorProfiles.userId, applicant.id));
      expect(rows).toHaveLength(1);
    });

    it("completes seller-managed COD delivery with dispatch, handover proof, and cash collection", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);
      const created = await createOrder(customerCaller, productsByKey.delivery, "delivery");

      // Seller progresses through acceptance and preparation
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "ready" });

      // Delivery order CANNOT jump from ready to delivered without dispatch
      await expect(
        vendorCaller.vendor.updateOrderStatus({
          orderId: created.orderId,
          status: "delivered",
          handoverCode: "12345678",
          cashAmountPaise: 1299,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      // Seller dispatches out for delivery
      await vendorCaller.vendor.updateOrderStatus({ orderId: created.orderId, status: "out_for_delivery" });

      const ready = await customerCaller.marketplace.orderDetail({ orderId: created.orderId });
      expect(ready.handoverCode).toMatch(/^\d{8}$/);

      // Successfully delivers with handover proof & cash collection
      const res = await vendorCaller.vendor.updateOrderStatus({
        orderId: created.orderId,
        status: "delivered",
        handoverCode: ready.handoverCode!,
        cashAmountPaise: ready.order.totalPaise,
        cashNote: "Exact seller COD collected",
      });
      expect(res.success).toBe(true);

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, created.orderId)).limit(1);
      expect(updatedOrder.status).toBe("delivered");
      expect(updatedOrder.paymentStatus).toBe("collected");

      // Duplicate delivery attempt is rejected
      await expect(
        vendorCaller.vendor.updateOrderStatus({
          orderId: created.orderId,
          status: "delivered",
          handoverCode: ready.handoverCode!,
          cashAmountPaise: ready.order.totalPaise,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects invalid vendor transitions based on fulfillmentType", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);

      // Pickup order cannot be dispatched out_for_delivery
      const pickupOrder = await createOrder(customerCaller, productsByKey.pickup, "pickup");
      await vendorCaller.vendor.updateOrderStatus({ orderId: pickupOrder.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: pickupOrder.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: pickupOrder.orderId, status: "ready" });

      await expect(
        vendorCaller.vendor.updateOrderStatus({ orderId: pickupOrder.orderId, status: "out_for_delivery" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("prevents vendor dispatch or completion when active platform rider assignment exists", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);
      const adminCaller = caller(admin);

      const deliveryOrder = await createOrder(customerCaller, productsByKey.delivery, "delivery");
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "ready" });

      // Admin assigns a platform rider
      await adminCaller.admin.assignRider({ orderId: deliveryOrder.orderId, riderId });

      // Vendor attempts to dispatch or deliver while rider assignment is active
      await expect(
        vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "out_for_delivery" })
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const [assignment] = await db.select().from(deliveryAssignments)
        .where(eq(deliveryAssignments.orderId, deliveryOrder.orderId)).limit(1);
      const riderCaller = caller(rider);
      await riderCaller.rider.updateDelivery({ assignmentId: assignment.id, action: "accept" });
      await riderCaller.rider.updateDelivery({ assignmentId: assignment.id, action: "arrived", proof: "At test shop" });
      await riderCaller.rider.updateDelivery({ assignmentId: assignment.id, action: "picked_up", proof: "Collected test parcel" });

      await expect(
        vendorCaller.vendor.updateOrderStatus({
          orderId: deliveryOrder.orderId,
          status: "delivered",
          handoverCode: "12345678",
          cashAmountPaise: 1299,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(vendorCaller.vendor.updateOrderStatus({
        orderId: deliveryOrder.orderId,
        status: "failed_delivery",
        reason: "Vendor cannot override the assigned rider",
      })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("handles failed delivery with non-restored inventory and executes auditable return recovery", async () => {
      const customerCaller = caller(customer);
      const vendorCaller = caller(vendorUser);

      const deliveryOrder = await createOrder(customerCaller, productsByKey.delivery, "delivery");
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "accepted" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "preparing" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "ready" });
      await vendorCaller.vendor.updateOrderStatus({ orderId: deliveryOrder.orderId, status: "out_for_delivery" });

      const [stockBefore] = await db
        .select({ qty: products.stockQuantity })
        .from(products)
        .where(eq(products.id, productsByKey.delivery.id));

      // Report delivery failure
      await vendorCaller.vendor.updateOrderStatus({
        orderId: deliveryOrder.orderId,
        status: "failed_delivery",
        reason: "Customer unreachable at door",
      });

      const [failedOrder] = await db.select().from(orders).where(eq(orders.id, deliveryOrder.orderId)).limit(1);
      expect(failedOrder.status).toBe("failed_delivery");
      expect(failedOrder.stockRestoredAt).toBeNull();

      // Stock has NOT been restored
      const [stockAfterFailure] = await db
        .select({ qty: products.stockQuantity })
        .from(products)
        .where(eq(products.id, productsByKey.delivery.id));
      expect(stockAfterFailure.qty).toBe(stockBefore.qty);

      const detail = await customerCaller.marketplace.orderDetail({ orderId: deliveryOrder.orderId });
      const recoveryItems = detail.items.map(item => ({
        orderItemId: item.id,
        restockedQuantity: item.quantity,
        damagedQuantity: 0,
        missingQuantity: 0,
      }));
      // Confirm physical inspection through the current item-level recovery API.
      const recoveryResult = await vendorCaller.vendor.recordReturnRecovery({
        orderId: deliveryOrder.orderId,
        items: recoveryItems,
        inspectionNotes: "Parcel returned intact. Restocked to shelf.",
      });
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.totalRestocked).toBe(1);
      expect(recoveryResult.totalDamaged).toBe(0);
      expect(recoveryResult.totalMissing).toBe(0);

      const [recoveredOrder] = await db.select().from(orders).where(eq(orders.id, deliveryOrder.orderId)).limit(1);
      expect(recoveredOrder.returnReceivedAt).toBeTruthy();
      expect(recoveredOrder.returnCondition).toBe("restocked");
      expect(recoveredOrder.stockRestoredAt).toBeTruthy();

      // Stock is now restored
      const [stockAfterRecovery] = await db
        .select({ qty: products.stockQuantity })
        .from(products)
        .where(eq(products.id, productsByKey.delivery.id));
      expect(stockAfterRecovery.qty).toBe(stockBefore.qty + 1);

      // Duplicate return recovery is rejected
      await expect(
        vendorCaller.vendor.recordReturnRecovery({
          orderId: deliveryOrder.orderId,
          items: recoveryItems,
          inspectionNotes: "Duplicate attempt",
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
  }
);

void workflow;
