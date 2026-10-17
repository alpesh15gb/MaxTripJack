CREATE TABLE supplier_searches(id uuid PRIMARY KEY,user_id text NOT NULL,company_id uuid REFERENCES companies(id),product text NOT NULL,criteria jsonb NOT NULL,results jsonb NOT NULL,correlation_id uuid NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE supplier_quotes(id uuid PRIMARY KEY,search_id uuid NOT NULL REFERENCES supplier_searches(id),user_id text NOT NULL,company_id uuid REFERENCES companies(id),product text NOT NULL,selection jsonb NOT NULL,review jsonb NOT NULL,supplier_booking_id text NOT NULL,supplier_minor bigint NOT NULL,total_minor bigint NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE orders ADD COLUMN quote_id uuid UNIQUE REFERENCES supplier_quotes(id);
ALTER TABLE orders ADD COLUMN guests_encrypted text;
ALTER TABLE orders ADD COLUMN supplier_status text;
CREATE TABLE gateway_intents(order_id uuid PRIMARY KEY REFERENCES orders(id),state text NOT NULL DEFAULT 'STARTED',gateway_order_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE booking_jobs(order_id uuid PRIMARY KEY REFERENCES orders(id),state text NOT NULL DEFAULT 'READY',attempted boolean NOT NULL DEFAULT false,next_attempt timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,checks integer NOT NULL DEFAULT 0);
