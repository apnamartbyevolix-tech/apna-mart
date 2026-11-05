ALTER TABLE `order_items` ADD `restockedQuantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `damagedQuantity` int DEFAULT 0 NOT NULL;