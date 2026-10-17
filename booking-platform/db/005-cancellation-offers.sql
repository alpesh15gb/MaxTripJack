ALTER TABLE cancellation_requests ADD COLUMN refund_offer_minor bigint;
ALTER TABLE cancellation_requests ADD COLUMN penalty_minor bigint;
ALTER TABLE cancellation_requests ADD COLUMN offer_version uuid;
ALTER TABLE cancellation_requests ADD COLUMN offer_expires_at timestamptz;
ALTER TABLE cancellation_requests ADD COLUMN accepted_at timestamptz;
ALTER TABLE cancellation_requests ADD COLUMN supplier_attempted_at timestamptz;
