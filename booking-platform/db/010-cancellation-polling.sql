ALTER TABLE cancellation_requests ADD COLUMN next_check timestamptz;
ALTER TABLE cancellation_requests ADD COLUMN poll_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX cancellation_pending_checks ON cancellation_requests(next_check) WHERE status='SUPPLIER_PENDING';
