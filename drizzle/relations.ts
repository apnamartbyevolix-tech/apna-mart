import { relations } from "drizzle-orm";
import {
  auditRecords,
  categories,
  customerAddresses,
  customerProfiles,
  deliveryAssignments,
  financialLedger,
  favoriteShops,
  orderEvents,
  orderItems,
  orders,
  paymentRecords,
  products,
  riderProfiles,
  serviceZones,
  shopReviews,
  supportMessages,
  supportTickets,
  towns,
  users,
  vendorCategories,
  vendorProfiles,
} from "./schema";

export const townRelations = relations(towns, ({ many }) => ({
  zones: many(serviceZones),
  vendors: many(vendorProfiles),
}));
export const zoneRelations = relations(serviceZones, ({ one, many }) => ({
  town: one(towns, { fields: [serviceZones.townId], references: [towns.id] }),
  vendors: many(vendorProfiles),
  addresses: many(customerAddresses),
}));
export const categoryRelations = relations(categories, ({ many }) => ({
  vendors: many(vendorProfiles),
  products: many(products),
}));
export const vendorRelations = relations(vendorProfiles, ({ one, many }) => ({
  user: one(users, { fields: [vendorProfiles.userId], references: [users.id] }),
  town: one(towns, { fields: [vendorProfiles.townId], references: [towns.id] }),
  zone: one(serviceZones, {
    fields: [vendorProfiles.zoneId],
    references: [serviceZones.id],
  }),
  category: one(categories, {
    fields: [vendorProfiles.categoryId],
    references: [categories.id],
  }),
  products: many(products),
  orders: many(orders),
  categories: many(vendorCategories),
}));
export const productRelations = relations(products, ({ one, many }) => ({
  vendor: one(vendorProfiles, {
    fields: [products.vendorId],
    references: [vendorProfiles.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  orderItems: many(orderItems),
}));
export const userRelations = relations(users, ({ one, many }) => ({
  customerProfile: one(customerProfiles, {
    fields: [users.id],
    references: [customerProfiles.userId],
  }),
  addresses: many(customerAddresses),
  vendorProfiles: many(vendorProfiles),
  riderProfile: one(riderProfiles, {
    fields: [users.id],
    references: [riderProfiles.userId],
  }),
  customerOrders: many(orders),
  audits: many(auditRecords),
  supportTickets: many(supportTickets),
  supportMessages: many(supportMessages),
  favoriteShops: many(favoriteShops),
  shopReviews: many(shopReviews),
}));
export const customerProfileRelations = relations(
  customerProfiles,
  ({ one }) => ({
    user: one(users, {
      fields: [customerProfiles.userId],
      references: [users.id],
    }),
    town: one(towns, {
      fields: [customerProfiles.defaultTownId],
      references: [towns.id],
    }),
    zone: one(serviceZones, {
      fields: [customerProfiles.defaultZoneId],
      references: [serviceZones.id],
    }),
  })
);
export const addressRelations = relations(customerAddresses, ({ one }) => ({
  user: one(users, {
    fields: [customerAddresses.userId],
    references: [users.id],
  }),
  town: one(towns, {
    fields: [customerAddresses.townId],
    references: [towns.id],
  }),
  zone: one(serviceZones, {
    fields: [customerAddresses.zoneId],
    references: [serviceZones.id],
  }),
}));
export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(users, { fields: [orders.customerId], references: [users.id] }),
  vendor: one(vendorProfiles, {
    fields: [orders.vendorId],
    references: [vendorProfiles.id],
  }),
  town: one(towns, { fields: [orders.townId], references: [towns.id] }),
  zone: one(serviceZones, {
    fields: [orders.zoneId],
    references: [serviceZones.id],
  }),
  items: many(orderItems),
  events: many(orderEvents),
  deliveries: many(deliveryAssignments),
  payments: many(paymentRecords),
  supportTickets: many(supportTickets),
  review: one(shopReviews, { fields: [orders.id], references: [shopReviews.orderId] }),
}));
export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
export const orderEventRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, {
    fields: [orderEvents.orderId],
    references: [orders.id],
  }),
  actor: one(users, {
    fields: [orderEvents.actorUserId],
    references: [users.id],
  }),
}));
export const riderRelations = relations(riderProfiles, ({ one, many }) => ({
  user: one(users, { fields: [riderProfiles.userId], references: [users.id] }),
  town: one(towns, { fields: [riderProfiles.townId], references: [towns.id] }),
  assignments: many(deliveryAssignments),
}));
export const deliveryRelations = relations(deliveryAssignments, ({ one }) => ({
  order: one(orders, {
    fields: [deliveryAssignments.orderId],
    references: [orders.id],
  }),
  rider: one(riderProfiles, {
    fields: [deliveryAssignments.riderId],
    references: [riderProfiles.id],
  }),
  admin: one(users, {
    fields: [deliveryAssignments.assignedBy],
    references: [users.id],
  }),
}));
export const financialRelations = relations(financialLedger, ({ one }) => ({
  order: one(orders, {
    fields: [financialLedger.orderId],
    references: [orders.id],
  }),
  vendor: one(vendorProfiles, {
    fields: [financialLedger.vendorId],
    references: [vendorProfiles.id],
  }),
}));

export const supportTicketRelations = relations(supportTickets, ({ one, many }) => ({
  customer: one(users, { fields: [supportTickets.customerId], references: [users.id] }),
  order: one(orders, { fields: [supportTickets.orderId], references: [orders.id] }),
  messages: many(supportMessages),
}));
export const supportMessageRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportMessages.ticketId], references: [supportTickets.id] }),
  sender: one(users, { fields: [supportMessages.senderUserId], references: [users.id] }),
}));
export const favoriteShopRelations = relations(favoriteShops, ({ one }) => ({
  customer: one(users, { fields: [favoriteShops.userId], references: [users.id] }),
  shop: one(vendorProfiles, { fields: [favoriteShops.vendorId], references: [vendorProfiles.id] }),
}));
export const shopReviewRelations = relations(shopReviews, ({ one }) => ({
  order: one(orders, { fields: [shopReviews.orderId], references: [orders.id] }),
  customer: one(users, { fields: [shopReviews.customerId], references: [users.id] }),
  shop: one(vendorProfiles, { fields: [shopReviews.vendorId], references: [vendorProfiles.id] }),
}));
