-- Preserve stock-confirmation and durable outbox invariants from MySQL migration 0009.
CREATE FUNCTION apna_guard_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('accepted','preparing','ready','out_for_delivery','delivered')
     AND EXISTS (SELECT 1 FROM apna_checkouts WHERE order_id=NEW.id AND state<>'COMMITTED') THEN
    RAISE EXCEPTION 'Apna stock confirmation is pending; retry sync before fulfilling' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER apna_order_transition BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION apna_guard_order_transition();
--> statement-breakpoint
CREATE FUNCTION apna_queue_order_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM apna_checkouts WHERE order_id=NEW.id) THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text='delivered' THEN
      INSERT INTO apna_outbox(order_id,operation) VALUES(NEW.id,'sale') ON CONFLICT (order_id,operation) DO NOTHING;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('cancelled','rejected') THEN
      INSERT INTO apna_outbox(order_id,operation) VALUES(NEW.id,'release') ON CONFLICT (order_id,operation) DO NOTHING;
    END IF;
    IF NEW."returnReceivedAt" IS NOT NULL AND OLD."returnReceivedAt" IS NULL THEN
      INSERT INTO apna_outbox(order_id,operation) VALUES(NEW.id,'return') ON CONFLICT (order_id,operation) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER apna_order_outbox AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION apna_queue_order_changes();
--> statement-breakpoint
-- MySQL ON UPDATE timestamps also run for raw SQL. Preserve that behavior in Postgres.
CREATE FUNCTION apna_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."updatedAt" IS NOT DISTINCT FROM OLD."updatedAt" THEN
    NEW."updatedAt" = timezone('UTC', statement_timestamp());
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE target text;
BEGIN
  FOR target IN SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='updatedAt'
  LOOP
    EXECUTE format('CREATE TRIGGER apna_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION apna_touch_updated_at()', target);
  END LOOP;
END;
$$;