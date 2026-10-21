-- Existing records are permanently attributed to Razorpay; provider selection
-- applies to new checkouts only. Never switch a persisted intent's provider.
ALTER TABLE payments ADD COLUMN provider text NOT NULL DEFAULT 'RAZORPAY'
 CHECK (provider IN ('RAZORPAY','PAYGLOCAL'));
ALTER TABLE gateway_intents ADD COLUMN provider text NOT NULL DEFAULT 'RAZORPAY'
 CHECK (provider IN ('RAZORPAY','PAYGLOCAL'));
CREATE TABLE payglocal_attempts (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 merchant_txn_id text NOT NULL UNIQUE,
 merchant_id text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0),
 currency text NOT NULL CHECK(currency = 'INR'),
 gid text UNIQUE,
 redirect_url text,
 status_url text,
 state text NOT NULL DEFAULT 'STARTED' CHECK(state IN ('STARTED','PENDING','UNKNOWN','CAPTURED')),
 last_provider_status text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((redirect_url IS NULL AND status_url IS NULL) OR gid IS NOT NULL)
);
