import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { parseLocalDatabaseConfig } from "./marketplace/database-config";
import {
  categories,
  products,
  serviceZones,
  towns,
  vendorProfiles,
} from "../drizzle/schema";

/** Explicit demo-only command. Uses stable keys and no-op duplicate updates so operator edits are never overwritten. */
async function seedDemo() {
  if(process.env.NODE_ENV==="production")throw new Error("Demo seeding is forbidden in production.");
  parseLocalDatabaseConfig(process.env.DATABASE_URL,"development");
  const db = await getDb();
  if (!db)
    throw new Error(
      "DATABASE_URL is required and the database must be migrated before seeding."
    );
  const townSlug = "neemgaon-demo";
  await db
    .insert(towns)
    .values({
      slug: townSlug,
      name: "Neemgaon Demo",
      state: "Maharashtra (fictional demo)",
      countryCode: "IN",
      active: true,
      isDemo: true,
    })
    .onConflictDoUpdate({ target: [towns.slug],  set: { slug: sql`${towns.slug}` } }).returning({ insertId: towns.id });
  const [town] = await db
    .select()
    .from(towns)
    .where(eq(towns.slug, townSlug))
    .limit(1);
  if (!town) throw new Error("Could not locate demo town");
  const zoneSlug = "neemgaon-central-demo";
  await db
    .insert(serviceZones)
    .values({
      townId: town.id,
      slug: zoneSlug,
      name: "Demo Bazaar",
      locality: "Demo Bazaar",
      postalCode: "000000",
      active: true,
    })
    .onConflictDoUpdate({ target: [serviceZones.townId, serviceZones.slug],  set: { slug: sql`${serviceZones.slug}` } }).returning({ insertId: serviceZones.id });
  const [zone] = await db
    .select()
    .from(serviceZones)
    .where(
      and(eq(serviceZones.townId, town.id), eq(serviceZones.slug, zoneSlug))
    )
    .limit(1);
  if (!zone) throw new Error("Could not locate demo service area");
  const categoryData = [
    ["grocery", "Groceries & Kirana", "basket", 10],
    ["vegetables", "Fresh Vegetables", "carrot", 20],
    ["dairy-bakery", "Dairy & Bakery", "milk", 30],
    ["stationery", "Stationery", "book", 40],
    ["fruits", "Fruits", "apple", 50],
    ["household", "Household Essentials", "home", 60],
    ["personal-care", "Personal Care", "sparkles", 70],
    ["snacks", "Snacks & Packaged Foods", "cookie", 80],
    ["hardware", "Hardware & Electrical", "wrench", 90],
    ["home-kitchen", "Home & Kitchen", "cooking-pot", 100],
    ["clothing-footwear", "Clothing & Footwear", "shirt", 105],
    ["other-local-shops", "Other Local Shops", "store", 108],
    [
      "regulated-medicines",
      "Medicines (disabled pending compliance)",
      "cross",
      110,
    ],
  ] as const;
  for (const [slug, name, icon, sortOrder] of categoryData)
    await db
      .insert(categories)
      .values({
        slug,
        name,
        icon,
        enabled: slug !== "regulated-medicines",
        regulated: slug === "regulated-medicines",
        sortOrder,
      })
      .onConflictDoUpdate({ target: [categories.slug],  set: { slug: sql`${categories.slug}` } }).returning({ insertId: categories.id });
  const cats = await db.select().from(categories);
  const catId = (slug: string) => {
    const row = cats.find(c => c.slug === slug);
    if (!row) throw new Error(`Missing category ${slug}`);
    return row.id;
  };
  const shops = [
    {
      slug: "demo-sunrise-kirana",
      shopName: "DEMO — Sunrise Kirana",
      category: "grocery",
      address: "12 Fictional Market Road, Demo Bazaar",
      products: [
        ["Toor Dal", "1 kg", 14500, 12],
        ["Basmati Rice", "1 kg", 9800, 15],
        ["Aashirvaad Atta", "5 kg", 28500, 8],
        ["Mustard Oil", "1 litre", 16800, 10],
      ] as const,
    },
    {
      slug: "demo-greenbasket-vegetables",
      shopName: "DEMO — Green Basket Vegetables",
      category: "vegetables",
      address: "4 Fictional Sabzi Lane, Demo Bazaar",
      products: [
        ["Tomatoes — 250 g", "250 g", 900, 20],
        ["Tomatoes — 500 g", "500 g", 1700, 20],
        ["Tomatoes", "1 kg", 3200, 20],
        ["Tomatoes — 2 kg", "2 kg", 6000, 20],
        ["Onions", "1 kg", 2800, 20],
        ["Potatoes", "1 kg", 2600, 25],
        ["Spinach", "1 bunch", 1800, 12],
      ] as const,
    },
    {
      slug: "demo-milkcrumb-dairy-bakery",
      shopName: "DEMO — Milk & Crumb Dairy/Bakery",
      category: "dairy-bakery",
      address: "8 Fictional Bakery Street, Demo Bazaar",
      products: [
        ["Toned Milk", "500 ml", 3200, 24],
        ["Curd", "500 g", 4200, 12],
        ["Bread Loaf", "400 g", 3800, 10],
        ["Paneer", "200 g", 9200, 8],
      ] as const,
    },
    {
      slug: "demo-pencilbox-stationery",
      shopName: "DEMO — Pencil Box Stationery",
      category: "stationery",
      address: "2 Fictional School Road, Demo Bazaar",
      products: [
        ["Blue Ball Pens", "Pack of 5", 4500, 30],
        ["Ruled Notebook", "1 piece", 5500, 25],
        ["HB Pencils", "Pack of 10", 6000, 20],
        ["Crayons", "Pack of 12", 8500, 12],
      ] as const,
    },
  ] as const;
  const demoImageByCategory: Record<string, string> = {
    grocery: "/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-1.webp",
    vegetables: "/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-2.webp",
    fruits: "/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-3.webp",
    "dairy-bakery": "/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-4.webp",
    stationery: "/manus-storage/async-images/Zrz4ZSFFgmjFx0mYyaO3Zu/image-5.webp",
  };
  for (const shop of shops) {
    await db
      .insert(vendorProfiles)
      .values({
        userId: null,
        townId: town.id,
        zoneId: zone.id,
        categoryId: catId(shop.category),
        slug: shop.slug,
        shopName: shop.shopName,
        description:
          "Fictional sample merchant for MyTown Market demonstration only. Not a participating business.",
        address: shop.address,
        phone: null,
        status: "approved",
        isOpen: true,
        isDemo: true,
        coverUrl: demoImageByCategory[shop.category] ?? null,
        deliveryEnabled: true,
        pickupEnabled: true,
        deliveryFeePaise: 2000,
        minimumOrderPaise: 10000,
        platformFeePaise: 0,
        commissionBps: 0,
        preparationMinutes: 25,
      })
      .onConflictDoUpdate({ target: [vendorProfiles.slug],  set: { slug: sql`${vendorProfiles.slug}` } }).returning({ insertId: vendorProfiles.id });
    const [vendor] = await db
      .select()
      .from(vendorProfiles)
      .where(eq(vendorProfiles.slug, shop.slug))
      .limit(1);
    if (!vendor) throw new Error(`Could not locate demo shop ${shop.slug}`);
    for (const [name, unit, pricePaise, stockQuantity] of shop.products) {
      const productSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await db
        .insert(products)
        .values({
          vendorId: vendor.id,
          categoryId: catId(shop.category),
          slug: productSlug,
          name,
          description: `Fictional demo listing: ${name}.`,
          unit,
          pricePaise,
          stockQuantity,
          imageUrl: demoImageByCategory[shop.category] ?? null,
          availability: "available",
          isDemo: true,
        })
        .onConflictDoUpdate({ target: [products.vendorId, products.slug],  set: { slug: sql`${products.slug}` } }).returning({ insertId: products.id });
    }
  }
  console.log(
    "Add-only demo seed complete: Neemgaon Demo town, configurable categories, four DEMO-labelled shops, and fictional sample products."
  );
}
seedDemo()
  .catch(error => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = await getDb();
    if (db) await db.$client.end();
  });
