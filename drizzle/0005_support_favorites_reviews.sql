CREATE TABLE `favorite_shops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vendorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorite_shops_id` PRIMARY KEY(`id`),
	CONSTRAINT `favorite_shops_owner_shop_uq` UNIQUE(`userId`,`vendorId`)
);
--> statement-breakpoint
CREATE TABLE `shop_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`customerId` int NOT NULL,
	`vendorId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` varchar(2000),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shop_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `shop_reviews_order_uq` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`senderUserId` int NOT NULL,
	`senderRole` enum('customer','admin') NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketNumber` varchar(40) NOT NULL,
	`customerId` int NOT NULL,
	`orderId` int,
	`subject` varchar(200) NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_ticketNumber_unique` UNIQUE(`ticketNumber`)
);
--> statement-breakpoint
ALTER TABLE `favorite_shops` ADD CONSTRAINT `favorite_shops_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorite_shops` ADD CONSTRAINT `favorite_shops_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shop_reviews` ADD CONSTRAINT `shop_reviews_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shop_reviews` ADD CONSTRAINT `shop_reviews_customerId_users_id_fk` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shop_reviews` ADD CONSTRAINT `shop_reviews_vendorId_vendor_profiles_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendor_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_ticketId_support_tickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_senderUserId_users_id_fk` FOREIGN KEY (`senderUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_customerId_users_id_fk` FOREIGN KEY (`customerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `favorite_shops_owner_ix` ON `favorite_shops` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `shop_reviews_shop_created_ix` ON `shop_reviews` (`vendorId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `shop_reviews_customer_ix` ON `shop_reviews` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `support_messages_ticket_ix` ON `support_messages` (`ticketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `support_tickets_customer_ix` ON `support_tickets` (`customerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `support_tickets_status_ix` ON `support_tickets` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `support_tickets_order_ix` ON `support_tickets` (`orderId`);