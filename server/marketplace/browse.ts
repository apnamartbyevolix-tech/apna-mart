import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  categories,
  products,
  serviceZones,
  towns,
  vendorProfiles,
} from "../../drizzle/schema";
import {
  publishedProductCondition,
  publishedSellerCondition,
} from "./publication-policy";
import type { getDb } from "../db";

export const browseInput = z.object({
  townId: z.number().int().positive(),
  zoneId: z.number().int().positive(),
  kind: z.enum(["products", "shops"]).default("products"),
  q: z.string().trim().max(160).optional(),
  shopId: z.number().int().positive().optional(),
  productIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
  categoryId: z.number().int().positive().optional(),
  onlyStock: z.boolean().default(true),
  offersOnly: z.boolean().default(false),
  festival: z.string().trim().max(80).optional(),
  sort: z.enum(["relevant", "low", "high"]).default("relevant"),
  limit: z.number().int().min(1).max(50).default(24),
  cursor: z
    .object({
      id: z.number().int().positive(),
      price: z.number().int().min(0).max(100000000),
    })
    .nullish(),
});
const shopCategory = alias(categories, "browse_shop_category");
export async function browseRows(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: z.infer<typeof browseInput>
) {
  const shopScope = [
    eq(vendorProfiles.townId, input.townId),
    eq(vendorProfiles.zoneId, input.zoneId),
    eq(serviceZones.townId, input.townId),
    eq(serviceZones.active, true),
    eq(towns.active, true),
    eq(vendorProfiles.status, "approved"),
    eq(vendorProfiles.isOpen, true),
    eq(shopCategory.enabled, true),
    eq(shopCategory.regulated, false),
    publishedSellerCondition(vendorProfiles.id, vendorProfiles.isDemo),
  ];
  if (input.kind === "shops") {
    const rows = await db
      .select({
        shop: vendorProfiles,
        zone: serviceZones,
        category: shopCategory,
        townName: towns.name,
      })
      .from(vendorProfiles)
      .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
      .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
      .innerJoin(shopCategory, eq(vendorProfiles.categoryId, shopCategory.id))
      .where(
        and(
          ...shopScope,
          input.cursor
            ? sql`${vendorProfiles.id}>${input.cursor.id}`
            : undefined,
          input.categoryId
            ? eq(vendorProfiles.categoryId, input.categoryId)
            : undefined,
          input.q
            ? or(
                ilike(vendorProfiles.shopName, `%${input.q}%`),
                ilike(shopCategory.name, `%${input.q}%`)
              )
            : undefined
        )
      )
      .orderBy(asc(vendorProfiles.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit),
      last = page.at(-1);
    return {
      shopRows: page,
      productRows: [],
      nextCursor:
        rows.length > input.limit && last
          ? { id: last.shop.id, price: 0 }
          : null,
    };
  }
  const offer = sql`(${products.offerMeta}::jsonb)`;
  const active = sql`(${offer}->>'startsAt')::timestamptz<=now() AND (${offer}->>'endsAt')::timestamptz>now()`;
  const price = sql<number>`CASE WHEN ${offer} IS NOT NULL AND ${active} THEN (${offer}->>'pricePaise')::integer ELSE COALESCE((${offer}->>'referencePricePaise')::integer,${products.pricePaise}) END`;
  const cursor = !input.cursor
    ? undefined
    : input.sort === "low"
      ? sql`(${price},${products.id})>(${input.cursor.price},${input.cursor.id})`
      : input.sort === "high"
        ? sql`(${price},${products.id})<(${input.cursor.price},${input.cursor.id})`
        : sql`${products.id}>${input.cursor.id}`;
  const rows = await db
    .select({
      product: products,
      shopName: vendorProfiles.shopName,
      effectivePrice: price,
    })
    .from(products)
    .innerJoin(vendorProfiles, eq(products.vendorId, vendorProfiles.id))
    .innerJoin(serviceZones, eq(vendorProfiles.zoneId, serviceZones.id))
    .innerJoin(towns, eq(vendorProfiles.townId, towns.id))
    .innerJoin(shopCategory, eq(vendorProfiles.categoryId, shopCategory.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        ...shopScope,
        publishedProductCondition(
          products.id,
          products.vendorId,
          products.isDemo
        ),
        eq(products.availability, "available"),
        eq(categories.enabled, true),
        eq(categories.regulated, false),
        cursor,
        input.onlyStock ? sql`${products.stockQuantity}>0` : undefined,
        input.offersOnly ? sql`${offer} IS NOT NULL AND ${active}` : undefined,
        input.festival ? sql`${offer}->>'festival' ILIKE ${"%" + input.festival.replace(/[\\%_]/g, "\\$&") + "%"}` : undefined,
        input.shopId ? eq(vendorProfiles.id, input.shopId) : undefined,
        input.productIds ? inArray(products.id, input.productIds) : undefined,
        input.categoryId
          ? eq(products.categoryId, input.categoryId)
          : undefined,
        input.q
          ? or(
              ilike(products.name, `%${input.q}%`),
              ilike(products.description, `%${input.q}%`)
            )
          : undefined
      )
    )
    .orderBy(
      ...(input.sort === "low"
        ? [asc(price), asc(products.id)]
        : input.sort === "high"
          ? [desc(price), desc(products.id)]
          : [asc(products.id)])
    )
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit),
    last = page.at(-1);
  return {
    shopRows: [],
    productRows: page,
    nextCursor:
      rows.length > input.limit && last
        ? { id: last.product.id, price: Number(last.effectivePrice) }
        : null,
  };
}
