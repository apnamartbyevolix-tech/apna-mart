ALTER TABLE products ADD COLUMN "taxMeta" json;
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN "taxSnapshot" json;
