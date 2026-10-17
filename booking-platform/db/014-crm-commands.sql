CREATE TABLE crm_commands (
 id uuid PRIMARY KEY,
 booking_id uuid NOT NULL REFERENCES orders(id),
 actor_id text NOT NULL,
 body_hash text NOT NULL,
 state text NOT NULL DEFAULT 'STARTED' CHECK(state IN ('STARTED','DONE','UNKNOWN')),
 response jsonb,
 http_status integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_commands_booking ON crm_commands(booking_id,created_at);
