-- Guest checkout: an anonymous shopping identity ("guest:<hash>") may own a
-- quote and order. The keyed hash of the contact email lets the same person
-- claim the booking after verifying that email, without storing it in clear.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_contact_hash text CHECK(guest_contact_hash IS NULL OR guest_contact_hash ~ '^[0-9a-f]{64}$');
CREATE INDEX IF NOT EXISTS orders_guest_claim ON orders(guest_contact_hash) WHERE guest_contact_hash IS NOT NULL AND user_id LIKE 'guest:%';
