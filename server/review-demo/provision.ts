import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewDemoConfig } from "../auth/review-demo-context";
import {
  users,
  customerProfiles,
  customerAddresses,
  towns,
  serviceZones,
  categories,
  vendorProfiles,
  vendorCategories,
  products,
} from "../../drizzle/schema";

/** Only initializes a new, dedicated database. Never copies production records,
 * rewrites the old local demo seeder, or grants a real merchant eligibility. */
export async function provisionReviewDemo() {
  const config = reviewDemoConfig();
  if (
    !config ||
    process.env.MTM_REVIEW_PROVISION_CONFIRM !== "fictional-review-only-v1"
  )
    throw Error(
      "Explicit isolated reviewer provisioning confirmation is required"
    );
  const pool = new Pool(config.connection),
    db = drizzle(pool);
  try {
    const marker = await pool.query(
      "SELECT to_regclass('public.review_demo_identity') AS marker"
    );
    if (marker.rows[0].marker) {
      const identity = await pool.query(
        "SELECT purpose FROM review_demo_identity WHERE id=1"
      );
      if (identity.rows[0]?.purpose !== "fictional-review-only-v1")
        throw Error("Unexpected database purpose");
      return { existing: true };
    }
    const tables = await pool.query(
      "SELECT count(*)::int AS total FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"
    );
    if (tables.rows[0].total !== 0)
      throw Error(
        "Refusing to seed a database containing existing tables or records"
      );
    await migrate(db, {
      migrationsFolder: resolve("drizzle/postgres/migrations"),
    });
    await db.transaction(async tx => {
      const [user] = await tx
        .insert(users)
        .values({
          openId: "review-demo-v1",
          name: "Demo Customer",
          loginMethod: "review-demo",
          role: "user",
        })
        .returning();
      const [town] = await tx
        .insert(towns)
        .values({
          slug: "review-demo-town",
          name: "Demo Town",
          state: "Fictional State",
          isDemo: true,
        })
        .returning();
      const [zone] = await tx
        .insert(serviceZones)
        .values({
          townId: town.id,
          slug: "demo-market",
          name: "Demo Market",
          locality: "Fictional Market",
          postalCode: "000000",
        })
        .returning();
      const [category] = await tx
        .insert(categories)
        .values({
          slug: "review-demo-groceries",
          name: "Groceries",
          icon: "ShoppingBasket",
          sortOrder: 1,
        })
        .returning();
      const [shop] = await tx
        .insert(vendorProfiles)
        .values({
          townId: town.id,
          zoneId: zone.id,
          categoryId: category.id,
          slug: "review-demo-shop",
          shopName: "Demo General Store",
          description:
            "Fictional review shop. No real delivery, payment or seller account.",
          address: "1 Demo Lane, Fictional Market",
          status: "approved",
          isOpen: true,
          isDemo: true,
          deliveryEnabled: true,
          pickupEnabled: true,
          preparationMinutes: 20,
        })
        .returning();
      await tx
        .insert(vendorCategories)
        .values({ vendorId: shop.id, categoryId: category.id });
      await tx.insert(products).values(
        [
          {
            slug: "review-demo-rice",
            name: "Demo Rice",
            unit: "1 kg",
            pricePaise: 6500,
          },
          {
            slug: "review-demo-flour",
            name: "Demo Wheat Flour",
            unit: "1 kg",
            pricePaise: 4500,
          },
          {
            slug: "review-demo-soap",
            name: "Demo Soap",
            unit: "1 piece",
            pricePaise: 3500,
          },
        ].map(item => ({
          ...item,
          vendorId: shop.id,
          categoryId: category.id,
          description: "Fictional demonstration item",
          stockQuantity: 100000,
          availability: "available" as const,
          isDemo: true,
        }))
      );
      await tx
        .insert(customerProfiles)
        .values({
          userId: user.id,
          phone: "0000000000",
          defaultTownId: town.id,
          defaultZoneId: zone.id,
        });
      await tx
        .insert(customerAddresses)
        .values({
          userId: user.id,
          townId: town.id,
          zoneId: zone.id,
          label: "Demo address",
          recipientName: "Demo Customer",
          phone: "0000000000",
          line1: "2 Fictional Lane",
          landmark: "Demo only - no deliveries",
          postalCode: "000000",
          isDefault: true,
        });
      // This marker is absent from production migrations and must be created only
      // by this guarded initializer, atomically with the fictional records.
      await tx.execute(
        sql`CREATE TABLE review_demo_identity(id integer PRIMARY KEY CHECK(id=1),purpose text NOT NULL)`
      );
      await tx.execute(
        sql`INSERT INTO review_demo_identity VALUES(1,'fictional-review-only-v1')`
      );
    });
    return {
      existing: false,
      fictionalShops: 1,
      fictionalProducts: 3,
      administratorAccounts: 0,
    };
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  provisionReviewDemo()
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(
        "Review database setup stopped. Verify the dedicated database, its permissions and empty-state requirement. No existing records were replaced."
      );
      process.exitCode = 1;
    });
}
