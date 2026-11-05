ALTER TABLE `orders` ADD `returnReceivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `returnCondition` varchar(32);--> statement-breakpoint
ALTER TABLE `orders` ADD `returnNotes` text;

