CREATE TABLE flight_price_alerts (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  recipient_hash bytea NOT NULL CHECK(octet_length(recipient_hash)=32),
  origin_code text NOT NULL CHECK(origin_code ~ '^[A-Z]{3}$'),
  destination_code text NOT NULL CHECK(destination_code ~ '^[A-Z]{3}$'),
  departure_date date NOT NULL,
  cabin text NOT NULL CHECK(cabin IN ('ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST')),
  baseline_minor bigint CHECK(baseline_minor > 0 AND baseline_minor <= 1000000000),
  baseline_at timestamptz,
  notified_minor bigint CHECK(notified_minor > 0 AND notified_minor < baseline_minor),
  dispatched_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,origin_code,destination_code,departure_date,cabin),
  CHECK (origin_code <> destination_code),
  CHECK ((baseline_minor IS NULL) = (baseline_at IS NULL)),
  CHECK ((notified_minor IS NULL) = (dispatched_at IS NULL)),
  CHECK (notified_at IS NULL OR dispatched_at IS NOT NULL)
);
CREATE INDEX flight_price_alerts_date ON flight_price_alerts(departure_date);
CREATE INDEX flight_price_alerts_active_route ON flight_price_alerts(origin_code,destination_code,departure_date,cabin)
  WHERE dispatched_at IS NULL;

-- One schedule per watched route, date and cabin. No passenger/customer details.
CREATE TABLE flight_price_alert_checks (
  origin_code text NOT NULL,
  destination_code text NOT NULL,
  departure_date date NOT NULL,
  cabin text NOT NULL,
  last_started_at timestamptz NOT NULL,
  PRIMARY KEY(origin_code,destination_code,departure_date,cabin)
);
CREATE INDEX flight_price_alert_checks_recent ON flight_price_alert_checks(last_started_at DESC);

DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='maxtravel_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON flight_price_alerts,flight_price_alert_checks TO maxtravel_app;
  END IF;
END $$;
