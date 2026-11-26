ALTER TABLE customer_phone_identities ADD COLUMN pin_salt char(32), ADD COLUMN pin_digest char(128), ADD COLUMN pin_attempts int NOT NULL DEFAULT 0, ADD COLUMN pin_locked_until datetime;
