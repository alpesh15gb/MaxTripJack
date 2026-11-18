-- Indicative "from" fares per route and departure day, observed from public
-- (non-corporate) searches and short background refreshes. No customer identity,
-- supplier session or bookable price ID is stored. Review always re-prices.
CREATE TABLE flight_fare_calendar (
  origin_code text NOT NULL CHECK(origin_code ~ '^[A-Z]{3}$'),
  destination_code text NOT NULL CHECK(destination_code ~ '^[A-Z]{3}$'),
  cabin text NOT NULL CHECK(cabin IN ('ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST')),
  departure_date date NOT NULL,
  lowest_adult_minor bigint NOT NULL CHECK(lowest_adult_minor>0 AND lowest_adult_minor<=1000000000),
  provider_environment text NOT NULL CHECK(provider_environment IN ('uat','production')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(origin_code,destination_code,cabin,departure_date,provider_environment),
  CHECK(origin_code<>destination_code)
);
CREATE INDEX flight_fare_calendar_observed ON flight_fare_calendar(observed_at);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='maxtravel_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON flight_fare_calendar TO maxtravel_app;
  END IF;
END $$;
