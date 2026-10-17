CREATE TABLE IF NOT EXISTS companies (
 id uuid PRIMARY KEY, name text NOT NULL, gst_number text, billing_address jsonb,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','SUSPENDED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_accounts (
 user_id text PRIMARY KEY, company_id uuid UNIQUE REFERENCES companies(id), active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS admin_grants (
 user_id text PRIMARY KEY, permissions text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS pricing_rules (
 id uuid PRIMARY KEY, company_id uuid REFERENCES companies(id), product text NOT NULL CHECK(product IN ('FLIGHT','HOTEL')),
 markup_minor bigint NOT NULL DEFAULT 0 CHECK(markup_minor>=0), markup_basis_points integer NOT NULL DEFAULT 0 CHECK(markup_basis_points BETWEEN 0 AND 10000),
 service_fee_minor bigint NOT NULL DEFAULT 0 CHECK(service_fee_minor>=0), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, user_id text NOT NULL, company_id uuid REFERENCES companies(id),
 product text NOT NULL CHECK(product IN ('FLIGHT','HOTEL')), status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','QUOTED','PAYMENT_PENDING','PAID','BOOKING_PENDING','CONFIRMED','TICKETED','BOOKING_FAILED','MANUAL_REVIEW','CANCELLED','CLOSED')),
 currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'), total_minor bigint NOT NULL CHECK(total_minor>=0), supplier_minor bigint NOT NULL CHECK(supplier_minor>=0),
 itinerary_summary jsonb NOT NULL DEFAULT '{}', policy_snapshot jsonb NOT NULL DEFAULT '{}', supplier_booking_id text UNIQUE, revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_owner ON orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS orders_company ON orders(company_id,created_at);
CREATE TABLE IF NOT EXISTS payments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), gateway_order_id text NOT NULL UNIQUE, gateway_payment_id text UNIQUE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 status text NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','AUTHORIZED','CAPTURED','FAILED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cancellation_requests (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), user_id text NOT NULL, reason text NOT NULL, request_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','UNDER_REVIEW','AWAITING_ACCEPTANCE','SUPPLIER_PENDING','CONFIRMED','REJECTED')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_cancellation ON cancellation_requests(order_id) WHERE status NOT IN ('CONFIRMED','REJECTED');
CREATE TABLE IF NOT EXISTS refunds (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL REFERENCES payments(id), gateway_refund_id text UNIQUE, amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','PROCESSING','COMPLETED','FAILED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_inbox (
 provider text NOT NULL, event_id text NOT NULL, body_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id)
);
CREATE TABLE IF NOT EXISTS outbox_events (
 id uuid PRIMARY KEY, aggregate_id uuid NOT NULL, event_type text NOT NULL, schema_version integer NOT NULL DEFAULT 1, payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_outbox ON outbox_events(next_attempt) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY, actor_id text, action text NOT NULL, entity_id uuid, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
