-- Bounded, coalesced server-to-server hints. Webhook fields never set payment
-- or refund outcomes; independently authenticated status checks do that.
ALTER TABLE payglocal_attempts ADD COLUMN webhook_received_at timestamptz;
ALTER TABLE payglocal_refund_attempts ADD COLUMN webhook_received_at timestamptz;
