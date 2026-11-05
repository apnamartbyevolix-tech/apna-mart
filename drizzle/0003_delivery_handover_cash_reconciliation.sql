ALTER TABLE `orders` MODIFY COLUMN `paymentStatus` enum('pending','collected','refunded','voided') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `payment_records` MODIFY COLUMN `status` enum('pending','collected','refunded','voided') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `payment_records` ADD `collectedAmountPaise` int;