import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { serviceZones, towns } from "../../drizzle/schema";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called only after publication consent/authentication, or an explicit operator area setup. */
export async function provisionPublishedLocation(tx: Transaction, shop: {
  city: string; state: string; postalCode?: string;
}) {
  const city = shop.city.trim(), state = shop.state.trim();
  if (!city || !state || (shop.postalCode !== undefined && !/^\d{6}$/.test(shop.postalCode)))
    throw new Error("A town, state and valid six-digit pincode are required");
  const townSlug = "in-" + createHash("sha256")
    .update(state.toLowerCase() + ":" + city.toLowerCase()).digest("hex").slice(0,24);
  await tx.insert(towns).values({slug:townSlug,name:city,state,isDemo:false}).onConflictDoNothing();
  const [town] = await tx.select().from(towns).where(eq(towns.slug,townSlug)).limit(1);
  const zoneSlug = shop.postalCode || townSlug;
  const insertZone = tx.insert(serviceZones).values({townId:town.id,slug:zoneSlug,
    name:shop.postalCode || city,locality:shop.postalCode || city,postalCode:shop.postalCode ?? null});
  if (shop.postalCode) await insertZone.onConflictDoUpdate({
    target:[serviceZones.townId,serviceZones.slug],set:{postalCode:shop.postalCode},
  });
  else await insertZone.onConflictDoNothing();
  const [zone] = await tx.select().from(serviceZones)
    .where(and(eq(serviceZones.townId,town.id),eq(serviceZones.slug,zoneSlug))).limit(1);
  return {townId:town.id,zoneId:zone.id};
}
