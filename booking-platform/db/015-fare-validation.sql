-- Fare Validate cannot be retried after an error/uncertain dispatch. Keep the
-- marker on the quote so browser retries and paid workers share one decision.
ALTER TABLE supplier_quotes ADD COLUMN fare_validation_state text
  CHECK(fare_validation_state IN ('STARTED','SUCCEEDED','BLOCKED'));
ALTER TABLE supplier_quotes ADD COLUMN fare_validation_hash text;
ALTER TABLE supplier_quotes ADD COLUMN fare_validation_started_at timestamptz;
ALTER TABLE supplier_quotes ADD COLUMN booking_validation_state text
  CHECK(booking_validation_state IN ('STARTED','SUCCEEDED','BLOCKED'));
ALTER TABLE supplier_quotes ADD COLUMN booking_validation_hash text;
ALTER TABLE supplier_quotes ADD COLUMN booking_validation_started_at timestamptz;
-- Historical quotes have no trustworthy dispatch record. Do not replay a
-- possible old validation after deployment; require new review or operations.
UPDATE supplier_quotes SET fare_validation_state='BLOCKED',booking_validation_state='BLOCKED'
WHERE product='FLIGHT' AND service_kind IS NULL;
