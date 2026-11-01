-- Persistent polling leases prevent callback floods / concurrent browsers from
-- duplicating financial actions. Unknown POST outcomes are never resubmitted.
ALTER TABLE payglocal_attempts ADD COLUMN next_check timestamptz NOT NULL DEFAULT now()+interval '30 seconds';
ALTER TABLE payglocal_attempts ADD COLUMN lease_until timestamptz;
ALTER TABLE payglocal_attempts ADD COLUMN lease_token uuid;
ALTER TABLE payglocal_attempts ADD COLUMN checks integer NOT NULL DEFAULT 0;
CREATE INDEX payglocal_attempts_due ON payglocal_attempts(next_check) WHERE state <> 'CAPTURED';
CREATE TABLE payglocal_refund_attempts (
 refund_id uuid PRIMARY KEY REFERENCES refunds(id),
 merchant_txn_id text NOT NULL UNIQUE,
 merchant_id text NOT NULL,
 original_gid text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0),
 gid text UNIQUE,
 last_provider_status text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Explicit finance attestation, separate from provider-verified API statuses.
CREATE TABLE payglocal_refund_settlements (
 refund_id uuid PRIMARY KEY REFERENCES refunds(id),
 request_id uuid NOT NULL UNIQUE,
 body_hash text NOT NULL,
 actor_id text NOT NULL,
 gateway_refund_id text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 bank_reference text NOT NULL,
 settled_on date NOT NULL,
 note text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
