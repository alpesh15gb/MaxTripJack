CREATE TABLE supplier_booking_payloads(order_id uuid PRIMARY KEY REFERENCES orders(id),encrypted_payload text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
