-- Run only on the dedicated disposable localhost database. Fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE u int; t int; z int; c int; v int; o int; ordinary int; s text; previous timestamp;
BEGIN
  IF current_database() !~ '^mtm_e2e_[A-Za-z0-9_]+_test$'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Safeguard tests require the disposable localhost _test database';
  END IF;
  INSERT INTO users("openId") VALUES('postgres-migration-fictional') RETURNING id INTO u;
  INSERT INTO towns(slug,name,state) VALUES('fictional-migration','Fictional town','Fictional state') RETURNING id INTO t;
  INSERT INTO service_zones("townId",slug,name,locality) VALUES(t,'fictional','Fictional zone','Fictional locality') RETURNING id INTO z;
  INSERT INTO categories(slug,name) VALUES('fictional','Fictional category') RETURNING id INTO c;
  INSERT INTO vendor_profiles("townId","zoneId","categoryId",slug,"shopName",address)
    VALUES(t,z,c,'fictional','Fictional shop','Fictional address') RETURNING id INTO v;
  INSERT INTO orders("orderNumber","customerId","vendorId","townId","zoneId","idempotencyKey","fulfillmentType","paymentMethod","subtotalPaise","totalPaise")
    VALUES('fictional-migration',u,v,t,z,'fictional-key','pickup','pickup',1299,1299) RETURNING id INTO o;
  INSERT INTO apna_links VALUES('fictional-merchant',v,1,true,now()+interval '1 day',now());
  INSERT INTO apna_checkouts(reference,merchant_id,vendor_id,request_key,body,order_id)
    VALUES('fictional-ref','fictional-merchant',v,'fictional-key','{"totalPaise":1299}',o);
  FOREACH s IN ARRAY ARRAY['accepted','preparing','ready','out_for_delivery','delivered'] LOOP
    BEGIN
      EXECUTE format('UPDATE orders SET status=%L WHERE id=$1',s) USING o;
      RAISE EXCEPTION 'Expected pending stock confirmation to block %',s USING ERRCODE='P0002';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM NOT LIKE 'Apna stock confirmation is pending%' THEN RAISE; END IF;
    END;
  END LOOP;
  UPDATE apna_checkouts SET state='COMMITTED' WHERE order_id=o;
  UPDATE orders SET status='accepted' WHERE id=o;
  UPDATE orders SET status='delivered' WHERE id=o;
  UPDATE orders SET status='ready' WHERE id=o;
  UPDATE orders SET status='delivered' WHERE id=o;
  IF (SELECT count(*) FROM apna_outbox WHERE order_id=o AND operation='sale') <> 1 THEN RAISE EXCEPTION 'Duplicate sale outbox'; END IF;
  UPDATE orders SET status='cancelled' WHERE id=o;
  UPDATE orders SET status='rejected' WHERE id=o;
  IF (SELECT count(*) FROM apna_outbox WHERE order_id=o AND operation='release') <> 1 THEN RAISE EXCEPTION 'Duplicate release outbox'; END IF;
  UPDATE orders SET "returnReceivedAt"=now() WHERE id=o;
  UPDATE orders SET "returnReceivedAt"=now()+interval '1 second' WHERE id=o;
  IF (SELECT count(*) FROM apna_outbox WHERE order_id=o AND operation='return') <> 1 THEN RAISE EXCEPTION 'Duplicate return outbox'; END IF;
  IF (SELECT body->>'totalPaise' FROM apna_checkouts WHERE order_id=o) <> '1299' THEN RAISE EXCEPTION 'JSON total changed'; END IF;
  BEGIN
    INSERT INTO orders("orderNumber","customerId","vendorId","townId","zoneId","idempotencyKey","fulfillmentType","paymentMethod","subtotalPaise","totalPaise")
      VALUES('fictional-duplicate',u,v,t,z,'fictional-key','pickup','pickup',1299,1299);
    RAISE EXCEPTION 'Duplicate checkout was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO orders("orderNumber","customerId","vendorId","townId","zoneId","idempotencyKey","fulfillmentType","paymentMethod","subtotalPaise","totalPaise")
    VALUES('fictional-ordinary',u,v,t,z,'ordinary-key','pickup','pickup',1299,1299) RETURNING id INTO ordinary;
  UPDATE orders SET status='delivered' WHERE id=ordinary;
  IF EXISTS(SELECT 1 FROM apna_outbox WHERE order_id=ordinary) THEN RAISE EXCEPTION 'Ordinary order generated ERP work'; END IF;
  UPDATE users SET "updatedAt"='2000-01-01' WHERE id=u;
  SELECT "updatedAt" INTO previous FROM users WHERE id=u;
  UPDATE users SET name='Fictional name' WHERE id=u;
  IF (SELECT "updatedAt" FROM users WHERE id=u) <= previous THEN RAISE EXCEPTION 'Raw SQL did not update timestamp'; END IF;
  RAISE NOTICE 'PASS: 5 pending transitions, committed fulfillment, unique sale/release/return, JSON paise, checkout idempotency, ordinary orders, raw timestamps';
END;
$$;
ROLLBACK;
