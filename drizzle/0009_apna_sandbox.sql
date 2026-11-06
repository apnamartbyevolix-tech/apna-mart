CREATE TABLE IF NOT EXISTS apna_links (
 merchant_id varchar(36) PRIMARY KEY, vendor_id int NOT NULL UNIQUE,
 version int NOT NULL, live boolean NOT NULL, expires_at datetime NOT NULL,
 verified_at datetime NOT NULL, FOREIGN KEY(vendor_id) REFERENCES vendor_profiles(id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS apna_products (
 product_id int PRIMARY KEY, vendor_id int NOT NULL, sku varchar(100) NOT NULL,
 UNIQUE(vendor_id,sku), FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(vendor_id) REFERENCES vendor_profiles(id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS apna_checkouts (
 reference varchar(64) PRIMARY KEY, merchant_id varchar(36) NOT NULL, vendor_id int NOT NULL,
 request_key varchar(36) NOT NULL, body json NOT NULL, response json,
 order_id int UNIQUE, state varchar(20) NOT NULL DEFAULT 'HOLD', created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(merchant_id) REFERENCES apna_links(merchant_id), FOREIGN KEY(order_id) REFERENCES orders(id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS apna_outbox (
 id int AUTO_INCREMENT PRIMARY KEY, order_id int NOT NULL, operation varchar(20) NOT NULL,
 request_key varchar(36), body json, done boolean NOT NULL DEFAULT false, attempts int NOT NULL DEFAULT 0,
 next_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, lease_until datetime,
 last_error varchar(200), UNIQUE(order_id,operation), FOREIGN KEY(order_id) REFERENCES orders(id)
);
--> statement-breakpoint
CREATE TRIGGER apna_order_transition BEFORE UPDATE ON orders FOR EACH ROW
BEGIN
 IF NEW.status<>OLD.status AND NEW.status IN('accepted','preparing','ready','out_for_delivery','delivered')
 AND EXISTS(SELECT 1 FROM apna_checkouts WHERE order_id=NEW.id AND state<>'COMMITTED') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Apna stock confirmation is pending; retry sync before fulfilling';
 END IF;
END;
--> statement-breakpoint
CREATE TRIGGER apna_order_outbox AFTER UPDATE ON orders FOR EACH ROW
BEGIN
 IF EXISTS(SELECT 1 FROM apna_checkouts WHERE order_id=NEW.id) THEN
  IF NEW.status<>OLD.status AND NEW.status='delivered' THEN
   INSERT IGNORE INTO apna_outbox(order_id,operation) VALUES(NEW.id,'sale');
  END IF;
  IF NEW.status<>OLD.status AND NEW.status IN('cancelled','rejected') THEN
   INSERT IGNORE INTO apna_outbox(order_id,operation) VALUES(NEW.id,'release');
  END IF;
  IF NEW.returnReceivedAt IS NOT NULL AND OLD.returnReceivedAt IS NULL THEN
   INSERT IGNORE INTO apna_outbox(order_id,operation) VALUES(NEW.id,'return');
  END IF;
 END IF;
END;
