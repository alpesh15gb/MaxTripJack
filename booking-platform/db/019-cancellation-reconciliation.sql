-- Additive recovery state. Keep the original submission marker and consent intact.
ALTER TABLE cancellation_requests ADD COLUMN lease_token uuid;
ALTER TABLE cancellation_requests ADD COLUMN lease_until timestamptz;
ALTER TABLE cancellation_requests ADD COLUMN last_checked_at timestamptz;
ALTER TABLE cancellation_requests ADD COLUMN supplier_status text;
ALTER TABLE cancellation_requests ADD COLUMN check_error text;
ALTER TABLE cancellation_requests ADD COLUMN follow_up_required_at timestamptz;
ALTER TABLE cancellation_requests ADD CONSTRAINT cancellation_lease_pair CHECK ((lease_token IS NULL) = (lease_until IS NULL));
