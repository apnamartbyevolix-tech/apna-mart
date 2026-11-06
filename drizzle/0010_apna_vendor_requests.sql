CREATE TABLE apna_vendor_requests (
 merchant_id varchar(36) NOT NULL, request_key varchar(36) NOT NULL,
 fingerprint varchar(64) NOT NULL, response json NOT NULL,
 created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(merchant_id,request_key),
 FOREIGN KEY(merchant_id) REFERENCES apna_links(merchant_id)
);
--> statement-breakpoint
ALTER TABLE products ADD COLUMN offerMeta json;
