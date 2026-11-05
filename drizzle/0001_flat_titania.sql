CREATE TABLE `audit_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(120) NOT NULL,
	`icon` varchar(80),
	`description` text,
	`enabled` boolean NOT NULL DEFAULT true,
	`regulated` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`townId` int NOT NULL,
	`zoneId` int NOT NULL,
	`label` varchar(40) NOT NULL DEFAULT 'Home',
	`recipientName` varchar(160) NOT NULL,
	`phone` varchar(30) NOT NULL,
	`line1` varchar(240) NOT NULL,
	`line2` varchar(240),
	`landmark` varchar(180),
	`postalCode` varchar(12),
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_profiles` (
	`userId` int NOT NULL,
	`phone` varchar(30),
	`defaultTownId` int,
	`defaultZoneId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `delivery_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`riderId` int NOT NULL,
	`assignedBy` int NOT NULL,
	`status` enum('assigned','accepted','declined','arrived','picked_up','delivered','failed') NOT NULL DEFAULT 'assigned',
	`arrivalNote` text,
	`pickupProof` text,
	`deliveryProof` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`vendorId` int,
	`kind` enum('sale','commission','delivery_fee','platform_fee','refund','settlement') NOT NULL,
	`amountPaise` int NOT NULL,
	`status` enum('pending','recorded','reversed') NOT NULL DEFAULT 'pending',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`actorUserId` int,
	`actorRole` varchar(24) NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`note` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int,
	`productNameSnapshot` varchar(180) NOT NULL,
	`unitSnapshot` varchar(48) NOT NULL,
	`quantity` int NOT NULL,
	`unitPricePaise` int NOT NULL,
	`lineTotalPaise` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(40) NOT NULL,
	`customerId` int NOT NULL,
	`vendorId` int NOT NULL,
	`townId` int NOT NULL,
	`zoneId` int NOT NULL,
	`idempotencyKey` varchar(96) NOT NULL,
	`status` enum('placed','accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled','failed_delivery') NOT NULL DEFAULT 'placed',
	`fulfillmentType` enum('delivery','pickup') NOT NULL,
	`paymentMethod` enum('cod','pickup') NOT NULL,
	`paymentStatus` enum('pending','collected','refunded') NOT NULL DEFAULT 'pending',
	`subtotalPaise` int NOT NULL,
	`discountPaise` int NOT NULL DEFAULT 0,
	`deliveryFeePaise` int NOT NULL DEFAULT 0,
	`platformFeePaise` int NOT NULL DEFAULT 0,
	`taxPaise` int NOT NULL DEFAULT 0,
	`totalPaise` int NOT NULL,
	`commissionPaise` int NOT NULL DEFAULT 0,
	`notes` text,
	`substitutionPreference` varchar(80),
	`addressSnapshot` json,
	`customerNameSnapshot` varchar(160),
	`customerPhoneSnapshot` varchar(30),
	`cancelReason` text,
	`stockRestoredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`),
	CONSTRAINT `orders_customer_idempotency_uq` UNIQUE(`customerId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`method` enum('cod','pickup') NOT NULL,
	`status` enum('pending','collected','refunded') NOT NULL DEFAULT 'pending',
	`amountPaise` int NOT NULL,
	`reference` varchar(120),
	`recordedBy` int,
	`recordedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` varchar(100) NOT NULL,
	`value` json,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendorId` int NOT NULL,
	`categoryId` int NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`unit` varchar(48) NOT NULL,
	`pricePaise` int NOT NULL,
	`mrpPaise` int,
	`stockQuantity` int NOT NULL DEFAULT 0,
	`availability` enum('available','unavailable','archived') NOT NULL DEFAULT 'available',
	`imageUrl` text,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_vendor_slug_uq` UNIQUE(`vendorId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `rider_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`townId` int NOT NULL,
	`phone` varchar(30) NOT NULL,
	`vehicleType` varchar(60),
	`status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
	`available` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rider_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `rider_profiles_user_uq` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `service_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`townId` int NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(160) NOT NULL,
	`locality` varchar(160) NOT NULL,
	`postalCode` varchar(12),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_zones_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_zones_town_slug_uq` UNIQUE(`townId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `towns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(160) NOT NULL,
	`state` varchar(100) NOT NULL,
	`countryCode` varchar(2) NOT NULL DEFAULT 'IN',
	`active` boolean NOT NULL DEFAULT true,
	`isDemo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `towns_id` PRIMARY KEY(`id`),
	CONSTRAINT `towns_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `vendor_categories` (
	`vendorId` int NOT NULL,
	`categoryId` int NOT NULL,
	CONSTRAINT `vendor_categories_pair_uq` UNIQUE(`vendorId`,`categoryId`)
);
--> statement-breakpoint
CREATE TABLE `vendor_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`townId` int NOT NULL,
	`zoneId` int NOT NULL,
	`categoryId` int NOT NULL,
	`slug` varchar(120) NOT NULL,
	`shopName` varchar(180) NOT NULL,
	`description` text,
	`address` text NOT NULL,
	`phone` varchar(30),
	`logoUrl` text,
	`coverUrl` text,
	`status` enum('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
	`isOpen` boolean NOT NULL DEFAULT false,
	`isDemo` boolean NOT NULL DEFAULT false,
	`deliveryEnabled` boolean NOT NULL DEFAULT true,
	`pickupEnabled` boolean NOT NULL DEFAULT true,
	`deliveryFeePaise` int NOT NULL DEFAULT 0,
	`minimumOrderPaise` int NOT NULL DEFAULT 0,
	`platformFeePaise` int NOT NULL DEFAULT 0,
	`commissionBps` int NOT NULL DEFAULT 0,
	`preparationMinutes` int NOT NULL DEFAULT 30,
	`settings` json,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_profiles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `audit_records` ADD CONSTRAINT `audit_records_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_townId_towns_id_fk` FOREIGN KEY (`townId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_zoneId_service_zones_id_fk` FOREIGN KEY (`zoneId`) REFERENCES `service_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_defaultTownId_towns_id_fk` FOREIGN KEY (`defaultTownId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_defaultZoneId_service_zones_id_fk` FOREIGN KEY (`defaultZoneId`) REFERENCES `service_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_assignments` ADD CONSTRAINT `delivery_assignments_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_assignments` ADD CONSTRAINT `delivery_assignments_riderId_rider_profiles_id_fk` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_assignments` ADD CONSTRAINT `delivery_assignments_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_ledger` ADD CONSTRAINT `financial_ledger_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_ledger` ADD CONSTRAINT `financial_ledger_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_users_id_fk` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_townId_towns_id_fk` FOREIGN KEY (`townId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_zoneId_service_zones_id_fk` FOREIGN KEY (`zoneId`) REFERENCES `service_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD CONSTRAINT `platform_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rider_profiles` ADD CONSTRAINT `rider_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rider_profiles` ADD CONSTRAINT `rider_profiles_townId_towns_id_fk` FOREIGN KEY (`townId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_zones` ADD CONSTRAINT `service_zones_townId_towns_id_fk` FOREIGN KEY (`townId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_categories` ADD CONSTRAINT `vendor_categories_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_categories` ADD CONSTRAINT `vendor_categories_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_profiles` ADD CONSTRAINT `vendor_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_profiles` ADD CONSTRAINT `vendor_profiles_townId_towns_id_fk` FOREIGN KEY (`townId`) REFERENCES `towns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_profiles` ADD CONSTRAINT `vendor_profiles_zoneId_service_zones_id_fk` FOREIGN KEY (`zoneId`) REFERENCES `service_zones`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_profiles` ADD CONSTRAINT `vendor_profiles_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_profiles` ADD CONSTRAINT `vendor_profiles_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_records_entity_ix` ON `audit_records` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `customer_addresses_owner_ix` ON `customer_addresses` (`userId`);--> statement-breakpoint
CREATE INDEX `delivery_assignments_order_ix` ON `delivery_assignments` (`orderId`);--> statement-breakpoint
CREATE INDEX `delivery_assignments_rider_status_ix` ON `delivery_assignments` (`riderId`,`status`);--> statement-breakpoint
CREATE INDEX `financial_ledger_order_ix` ON `financial_ledger` (`orderId`);--> statement-breakpoint
CREATE INDEX `financial_ledger_vendor_ix` ON `financial_ledger` (`vendorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_events_order_ix` ON `order_events` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_items_order_ix` ON `order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `orders_vendor_status_ix` ON `orders` (`vendorId`,`status`);--> statement-breakpoint
CREATE INDEX `orders_customer_ix` ON `orders` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payment_records_order_ix` ON `payment_records` (`orderId`);--> statement-breakpoint
CREATE INDEX `products_visible_ix` ON `products` (`vendorId`,`availability`,`stockQuantity`);--> statement-breakpoint
CREATE INDEX `rider_profiles_town_status_ix` ON `rider_profiles` (`townId`,`status`);--> statement-breakpoint
CREATE INDEX `service_zones_locality_ix` ON `service_zones` (`townId`,`locality`);--> statement-breakpoint
CREATE INDEX `vendor_profiles_user_ix` ON `vendor_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `vendor_profiles_town_status_ix` ON `vendor_profiles` (`townId`,`status`);