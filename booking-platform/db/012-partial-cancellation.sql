ALTER TABLE cancellation_requests ADD COLUMN IF NOT EXISTS scope jsonb;
ALTER TABLE cancellation_requests ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false;
