import type {PublicOffer} from "../shared/offers";
import {sql} from "drizzle-orm";
import {
  boolean,
  char,
  primaryKey,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Existing Manus OAuth identity table. Never replace or reset this table. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export const customerPhoneIdentities=mysqlTable('customer_phone_identities',{
 phone:varchar('phone',{length:16}).primaryKey(),userId:int('user_id').notNull().unique().references(()=>users.id),verifiedAt:datetime('verified_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const customerOtpChallenges=mysqlTable('customer_otp_challenges',{
 id:varchar('id',{length:36}).primaryKey(),phone:varchar('phone',{length:16}).notNull(),digest:char('digest',{length:64}).notNull(),browserHash:char('browser_hash',{length:64}).notNull(),state:varchar('state',{length:12}).notNull(),attempts:int('attempts').notNull().default(0),expiresAt:datetime('expires_at').notNull(),createdAt:datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>({phoneCreated:index('otp_phone_created').on(t.phone,t.createdAt)}));
export const customerAuthLimits=mysqlTable('customer_auth_limits',{
 bucket:char('bucket',{length:64}).primaryKey(),hits:int('hits').notNull(),resetsAt:datetime('resets_at').notNull(),lastAt:datetime('last_at').notNull(),
});
export const customerMobileSessions=mysqlTable('customer_mobile_sessions',{
 tokenHash:char('token_hash',{length:64}).primaryKey(),userId:int('user_id').notNull().references(()=>users.id),expiresAt:datetime('expires_at').notNull(),lastSeenAt:datetime('last_seen_at').notNull().default(sql`CURRENT_TIMESTAMP`),revokedAt:datetime('revoked_at'),createdAt:datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>({user:index('mobile_session_user').on(t.userId)}));

export const towns = mysqlTable("towns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  countryCode: varchar("countryCode", { length: 2 }).notNull().default("IN"),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("isDemo").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export const serviceZones = mysqlTable(
  "service_zones",
  {
    id: int("id").autoincrement().primaryKey(),
    townId: int("townId")
      .notNull()
      .references(() => towns.id),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    locality: varchar("locality", { length: 160 }).notNull(),
    postalCode: varchar("postalCode", { length: 12 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    zoneSlug: uniqueIndex("service_zones_town_slug_uq").on(t.townId, t.slug),
    localityIx: index("service_zones_locality_ix").on(t.townId, t.locality),
  })
);
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  icon: varchar("icon", { length: 80 }),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  regulated: boolean("regulated").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export const vendorProfiles = mysqlTable(
  "vendor_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    townId: int("townId")
      .notNull()
      .references(() => towns.id),
    zoneId: int("zoneId")
      .notNull()
      .references(() => serviceZones.id),
    categoryId: int("categoryId")
      .notNull()
      .references(() => categories.id),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    shopName: varchar("shopName", { length: 180 }).notNull(),
    description: text("description"),
    address: text("address").notNull(),
    phone: varchar("phone", { length: 30 }),
    logoUrl: text("logoUrl"),
    coverUrl: text("coverUrl"),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "suspended",
    ])
      .notNull()
      .default("pending"),
    isOpen: boolean("isOpen").notNull().default(false),
    isDemo: boolean("isDemo").notNull().default(false),
    deliveryEnabled: boolean("deliveryEnabled").notNull().default(true),
    pickupEnabled: boolean("pickupEnabled").notNull().default(true),
    deliveryFeePaise: int("deliveryFeePaise").notNull().default(0),
    minimumOrderPaise: int("minimumOrderPaise").notNull().default(0),
    platformFeePaise: int("platformFeePaise").notNull().default(0),
    commissionBps: int("commissionBps").notNull().default(0),
    preparationMinutes: int("preparationMinutes").notNull().default(30),
    settings: json("settings").$type<Record<string, unknown> | null>(),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    userIx: index("vendor_profiles_user_ix").on(t.userId),
    townStatusIx: index("vendor_profiles_town_status_ix").on(
      t.townId,
      t.status
    ),
  })
);
export const vendorCategories = mysqlTable(
  "vendor_categories",
  {
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id),
    categoryId: int("categoryId")
      .notNull()
      .references(() => categories.id),
  },
  t => ({
    pair: uniqueIndex("vendor_categories_pair_uq").on(t.vendorId, t.categoryId),
  })
);
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id),
    categoryId: int("categoryId")
      .notNull()
      .references(() => categories.id),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    unit: varchar("unit", { length: 48 }).notNull(),
    pricePaise: int("pricePaise").notNull(),
    offerMeta:json("offerMeta").$type<PublicOffer|null>(),
    mrpPaise: int("mrpPaise"),
    stockQuantity: int("stockQuantity").notNull().default(0),
    availability: mysqlEnum("availability", [
      "available",
      "unavailable",
      "archived",
    ])
      .notNull()
      .default("available"),
    imageUrl: text("imageUrl"),
    isDemo: boolean("isDemo").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    vendorSlug: uniqueIndex("products_vendor_slug_uq").on(t.vendorId, t.slug),
    visibleIx: index("products_visible_ix").on(
      t.vendorId,
      t.availability,
      t.stockQuantity
    ),
  })
);
export const customerProfiles = mysqlTable("customer_profiles", {
  userId: int("userId")
    .primaryKey()
    .references(() => users.id),
  phone: varchar("phone", { length: 30 }),
  defaultTownId: int("defaultTownId").references(() => towns.id),
  defaultZoneId: int("defaultZoneId").references(() => serviceZones.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export const customerAddresses = mysqlTable(
  "customer_addresses",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    townId: int("townId")
      .notNull()
      .references(() => towns.id),
    zoneId: int("zoneId")
      .notNull()
      .references(() => serviceZones.id),
    label: varchar("label", { length: 40 }).notNull().default("Home"),
    recipientName: varchar("recipientName", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    line1: varchar("line1", { length: 240 }).notNull(),
    line2: varchar("line2", { length: 240 }),
    landmark: varchar("landmark", { length: 180 }),
    postalCode: varchar("postalCode", { length: 12 }),
    isDefault: boolean("isDefault").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({ ownerIx: index("customer_addresses_owner_ix").on(t.userId) })
);
export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
    customerId: int("customerId")
      .notNull()
      .references(() => users.id),
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id),
    townId: int("townId")
      .notNull()
      .references(() => towns.id),
    zoneId: int("zoneId")
      .notNull()
      .references(() => serviceZones.id),
    idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull(),
    status: mysqlEnum("status", [
      "placed",
      "accepted",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "rejected",
      "cancelled",
      "failed_delivery",
    ])
      .notNull()
      .default("placed"),
    fulfillmentType: mysqlEnum("fulfillmentType", [
      "delivery",
      "pickup",
    ]).notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cod", "pickup"]).notNull(),
    handoverAttempts: int("handoverAttempts").notNull().default(0),
    handoverLockedAt: timestamp("handoverLockedAt"),
    paymentStatus: mysqlEnum("paymentStatus", [
      "pending",
      "collected",
      "refunded",
      "voided",
    ])
      .notNull()
      .default("pending"),
    subtotalPaise: int("subtotalPaise").notNull(),
    discountPaise: int("discountPaise").notNull().default(0),
    deliveryFeePaise: int("deliveryFeePaise").notNull().default(0),
    platformFeePaise: int("platformFeePaise").notNull().default(0),
    taxPaise: int("taxPaise").notNull().default(0),
    totalPaise: int("totalPaise").notNull(),
    commissionPaise: int("commissionPaise").notNull().default(0),
    notes: text("notes"),
    substitutionPreference: varchar("substitutionPreference", { length: 80 }),
    addressSnapshot: json("addressSnapshot").$type<Record<
      string,
      unknown
    > | null>(),
    customerNameSnapshot: varchar("customerNameSnapshot", { length: 160 }),
    customerPhoneSnapshot: varchar("customerPhoneSnapshot", { length: 30 }),
    cancelReason: text("cancelReason"),
    stockRestoredAt: timestamp("stockRestoredAt"),
    returnReceivedAt: timestamp("returnReceivedAt"),
    returnCondition: varchar("returnCondition", { length: 32 }),
    returnNotes: text("returnNotes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    customerKey: uniqueIndex("orders_customer_idempotency_uq").on(
      t.customerId,
      t.idempotencyKey
    ),
    vendorStatusIx: index("orders_vendor_status_ix").on(t.vendorId, t.status),
    customerIx: index("orders_customer_ix").on(t.customerId, t.createdAt),
  })
);
export const orderItems = mysqlTable(
  "order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    productId: int("productId").references(() => products.id),
    productNameSnapshot: varchar("productNameSnapshot", {
      length: 180,
    }).notNull(),
    unitSnapshot: varchar("unitSnapshot", { length: 48 }).notNull(),
    quantity: int("quantity").notNull(),
    restockedQuantity: int("restockedQuantity").notNull().default(0),
    damagedQuantity: int("damagedQuantity").notNull().default(0),
    missingQuantity: int("missingQuantity").notNull().default(0),
    unitPricePaise: int("unitPricePaise").notNull(),
    lineTotalPaise: int("lineTotalPaise").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({ orderIx: index("order_items_order_ix").on(t.orderId) })
);
export const orderEvents = mysqlTable(
  "order_events",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    actorUserId: int("actorUserId").references(() => users.id),
    actorRole: varchar("actorRole", { length: 24 }).notNull(),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    note: text("note"),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({ orderIx: index("order_events_order_ix").on(t.orderId, t.createdAt) })
);
export const riderProfiles = mysqlTable(
  "rider_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    townId: int("townId")
      .notNull()
      .references(() => towns.id),
    phone: varchar("phone", { length: 30 }).notNull(),
    vehicleType: varchar("vehicleType", { length: 60 }),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "suspended",
    ])
      .notNull()
      .default("pending"),
    available: boolean("available").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    userIx: uniqueIndex("rider_profiles_user_uq").on(t.userId),
    townStatusIx: index("rider_profiles_town_status_ix").on(t.townId, t.status),
  })
);
export const deliveryAssignments = mysqlTable(
  "delivery_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    riderId: int("riderId")
      .notNull()
      .references(() => riderProfiles.id),
    assignedBy: int("assignedBy")
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", [
      "assigned",
      "accepted",
      "declined",
      "arrived",
      "picked_up",
      "delivered",
      "failed",
    ])
      .notNull()
      .default("assigned"),
    arrivalNote: text("arrivalNote"),
    pickupProof: text("pickupProof"),
    deliveryProof: text("deliveryProof"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    orderIx: index("delivery_assignments_order_ix").on(t.orderId),
    riderStatusIx: index("delivery_assignments_rider_status_ix").on(
      t.riderId,
      t.status
    ),
  })
);
export const paymentRecords = mysqlTable(
  "payment_records",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    method: mysqlEnum("method", ["cod", "pickup"]).notNull(),
    status: mysqlEnum("status", ["pending", "collected", "refunded", "voided"])
      .notNull()
      .default("pending"),
    amountPaise: int("amountPaise").notNull(),
    collectedAmountPaise: int("collectedAmountPaise"),
    reference: varchar("reference", { length: 120 }),
    recordedBy: int("recordedBy").references(() => users.id),
    recordedAt: timestamp("recordedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({ orderIx: index("payment_records_order_ix").on(t.orderId) })
);
export const financialLedger = mysqlTable(
  "financial_ledger",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").references(() => orders.id),
    vendorId: int("vendorId").references(() => vendorProfiles.id),
    kind: mysqlEnum("kind", [
      "sale",
      "commission",
      "delivery_fee",
      "platform_fee",
      "refund",
      "settlement",
    ]).notNull(),
    amountPaise: int("amountPaise").notNull(),
    status: mysqlEnum("status", ["pending", "recorded", "reversed"])
      .notNull()
      .default("pending"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    orderIx: index("financial_ledger_order_ix").on(t.orderId),
    vendorIx: index("financial_ledger_vendor_ix").on(t.vendorId, t.createdAt),
  })
);
export const auditRecords = mysqlTable(
  "audit_records",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    details: json("details").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    entityIx: index("audit_records_entity_ix").on(t.entityType, t.entityId),
  })
);
export const platformSettings = mysqlTable("platform_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: json("value").$type<unknown>(),
  updatedBy: int("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});


/** Private customer/admin support conversation. Never expose these rows in public queries. */
export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketNumber: varchar("ticketNumber", { length: 40 }).notNull().unique(),
    customerId: int("customerId")
      .notNull()
      .references(() => users.id),
    orderId: int("orderId").references(() => orders.id),
    subject: varchar("subject", { length: 200 }).notNull(),
    status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"])
      .notNull()
      .default("open"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    customerIx: index("support_tickets_customer_ix").on(t.customerId, t.updatedAt),
    statusIx: index("support_tickets_status_ix").on(t.status, t.createdAt),
    orderIx: index("support_tickets_order_ix").on(t.orderId),
  })
);
export const supportMessages = mysqlTable(
  "support_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketId: int("ticketId")
      .notNull()
      .references(() => supportTickets.id),
    senderUserId: int("senderUserId")
      .notNull()
      .references(() => users.id),
    senderRole: mysqlEnum("senderRole", ["customer", "admin"]).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({ ticketIx: index("support_messages_ticket_ix").on(t.ticketId, t.createdAt) })
);
export const favoriteShops = mysqlTable(
  "favorite_shops",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    ownerShop: uniqueIndex("favorite_shops_owner_shop_uq").on(t.userId, t.vendorId),
    ownerIx: index("favorite_shops_owner_ix").on(t.userId, t.createdAt),
  })
);
export const shopReviews = mysqlTable(
  "shop_reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId")
      .notNull()
      .references(() => orders.id),
    customerId: int("customerId")
      .notNull()
      .references(() => users.id),
    vendorId: int("vendorId")
      .notNull()
      .references(() => vendorProfiles.id),
    rating: int("rating").notNull(),
    comment: varchar("comment", { length: 2000 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    orderUnique: uniqueIndex("shop_reviews_order_uq").on(t.orderId),
    shopCreatedIx: index("shop_reviews_shop_created_ix").on(t.vendorId, t.createdAt),
    customerIx: index("shop_reviews_customer_ix").on(t.customerId, t.createdAt),
  })
);

// Local integration persistence. Public activation remains disabled outside the isolated sandbox.
export const apnaLinks=mysqlTable("apna_links",{
 merchantId:varchar("merchant_id",{length:36}).primaryKey(),
 vendorId:int("vendor_id").notNull().unique().references(()=>vendorProfiles.id),
 version:int("version").notNull(),live:boolean("live").notNull(),
 expiresAt:datetime("expires_at").notNull(),verifiedAt:datetime("verified_at").notNull(),
});
export const apnaProducts=mysqlTable("apna_products",{
 productId:int("product_id").primaryKey().references(()=>products.id),
 vendorId:int("vendor_id").notNull().references(()=>vendorProfiles.id),sku:varchar("sku",{length:100}).notNull(),
},t=>({pair:uniqueIndex("apna_products_vendor_id_sku_unique").on(t.vendorId,t.sku)}));
export const apnaCheckouts=mysqlTable("apna_checkouts",{
 reference:varchar("reference",{length:64}).primaryKey(),merchantId:varchar("merchant_id",{length:36}).notNull().references(()=>apnaLinks.merchantId),
 vendorId:int("vendor_id").notNull(),requestKey:varchar("request_key",{length:36}).notNull(),body:json("body").notNull(),response:json("response"),
 orderId:int("order_id").unique().references(()=>orders.id),state:varchar("state",{length:20}).notNull().default("HOLD"),createdAt:datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const apnaOutbox=mysqlTable("apna_outbox",{
 id:int("id").autoincrement().primaryKey(),orderId:int("order_id").notNull().references(()=>orders.id),operation:varchar("operation",{length:20}).notNull(),
 requestKey:varchar("request_key",{length:36}),body:json("body"),done:boolean("done").notNull().default(false),attempts:int("attempts").notNull().default(0),
 nextAt:datetime("next_at").notNull().default(sql`CURRENT_TIMESTAMP`),leaseUntil:datetime("lease_until"),lastError:varchar("last_error",{length:200}),
},t=>({operationKey:uniqueIndex("apna_outbox_order_id_operation_unique").on(t.orderId,t.operation)}));

export const apnaVendorRequests=mysqlTable("apna_vendor_requests",{
 merchantId:varchar("merchant_id",{length:36}).notNull().references(()=>apnaLinks.merchantId),requestKey:varchar("request_key",{length:36}).notNull(),
 fingerprint:varchar("fingerprint",{length:64}).notNull(),response:json("response").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>({key:primaryKey({columns:[t.merchantId,t.requestKey]})}));
