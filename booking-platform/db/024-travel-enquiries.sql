CREATE TABLE travel_enquiries (
 id uuid PRIMARY KEY,
 reference text NOT NULL UNIQUE,
 user_id text NOT NULL,
 company_id uuid REFERENCES companies(id),
 request_key uuid NOT NULL,
 body_hash text NOT NULL CHECK(body_hash ~ '^[0-9a-f]{64}$'),
 service text NOT NULL CHECK(service IN ('VISA','INSURANCE','HOLIDAY','CRUISE')),
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','QUOTED','CLOSED')),
 draft jsonb NOT NULL CHECK(jsonb_typeof(draft)='object'),
 contact jsonb NOT NULL CHECK(jsonb_typeof(contact)='object'),
 contact_verified boolean NOT NULL DEFAULT false CHECK(contact_verified=false),
 consent_at timestamptz NOT NULL DEFAULT now(),
 internal_note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 crm_event_id uuid NOT NULL UNIQUE REFERENCES outbox_events(id),
 crm_reference text,
 crm_lead_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX travel_enquiries_register ON travel_enquiries(status,created_at DESC);
CREATE INDEX travel_enquiries_owner ON travel_enquiries(user_id,created_at DESC);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maxtravel_app') THEN
  GRANT SELECT,INSERT,UPDATE ON travel_enquiries TO maxtravel_app;
 END IF;
END $$;
