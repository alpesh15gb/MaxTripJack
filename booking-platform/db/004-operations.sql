CREATE TABLE saved_travellers(id uuid PRIMARY KEY,user_id text NOT NULL,company_id uuid REFERENCES companies(id),name text NOT NULL,encrypted_profile text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX saved_travellers_owner ON saved_travellers(user_id,company_id);
ALTER TABLE cancellation_requests ADD COLUMN reviewed_by text;
ALTER TABLE cancellation_requests ADD COLUMN review_note text;
ALTER TABLE refunds ADD COLUMN requested_by text;
ALTER TABLE refunds ADD COLUMN approved_by text;
ALTER TABLE refunds ADD COLUMN reason text;
ALTER TABLE refunds ADD COLUMN operation_started_at timestamptz;
ALTER TABLE refunds ADD COLUMN next_check timestamptz;
