ALTER TABLE outbox_events ADD COLUMN delivery_payload text;
CREATE TABLE customer_notifications (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 revision bigint NOT NULL,
 status text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 UNIQUE(order_id,revision)
);
CREATE FUNCTION queue_customer_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('TICKETED','CONFIRMED','BOOKING_FAILED','MANUAL_REVIEW','CANCELLED') THEN
  INSERT INTO customer_notifications(id,order_id,revision,status)
  VALUES(gen_random_uuid(),NEW.id,NEW.revision,NEW.status) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER order_customer_status AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION queue_customer_status();
