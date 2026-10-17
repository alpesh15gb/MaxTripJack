ALTER TABLE orders ADD COLUMN parent_order_id uuid REFERENCES orders(id);
ALTER TABLE orders ADD COLUMN service_kind text CHECK(service_kind IN ('ANCILLARY','REISSUE'));
CREATE INDEX orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
ALTER TABLE supplier_searches ADD COLUMN parent_order_id uuid REFERENCES orders(id);
ALTER TABLE supplier_searches ADD COLUMN service_kind text CHECK(service_kind IN ('ANCILLARY','REISSUE'));
ALTER TABLE supplier_searches ADD COLUMN service_context jsonb;
ALTER TABLE supplier_quotes ADD COLUMN service_kind text CHECK(service_kind IN ('ANCILLARY','REISSUE'));
ALTER TABLE supplier_quotes ADD COLUMN service_payload jsonb;
ALTER TABLE booking_jobs ADD COLUMN amendment_ids jsonb;
