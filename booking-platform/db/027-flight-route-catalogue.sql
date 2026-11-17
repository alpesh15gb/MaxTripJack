-- Public planning catalogue only: no fares, customer identities or supplier sessions.
-- Historical searches were all made against the hardcoded UAT provider. Preserve that provenance.
ALTER TABLE supplier_searches ADD COLUMN provider_environment text NOT NULL DEFAULT 'uat' CHECK(provider_environment IN ('uat','production'));
CREATE INDEX supplier_searches_route_discovery ON supplier_searches(created_at,id) WHERE product='FLIGHT';
CREATE TABLE flight_route_catalogue (
  origin_code text NOT NULL CHECK(origin_code ~ '^[A-Z]{3}$'),
  destination_code text NOT NULL CHECK(destination_code ~ '^[A-Z]{3}$'),
  canonical_slug text NOT NULL UNIQUE CHECK(length(canonical_slug)<=180),
  source_url text NOT NULL CHECK(length(source_url)<=1000),
  source_environment text NOT NULL CHECK(source_environment IN ('uat','production')),
  source_kind text NOT NULL CHECK(source_kind IN ('manifest','observed')),
  verified_at timestamptz NOT NULL,
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  active boolean NOT NULL DEFAULT true,
  content_ready boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(origin_code,destination_code),
  CHECK(origin_code<>destination_code)
);
CREATE INDEX flight_route_catalogue_public ON flight_route_catalogue(source_environment,active,origin_code,destination_code);
CREATE TABLE flight_route_discovery_checkpoint (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  last_created_at timestamptz NOT NULL DEFAULT '1970-01-01',
  last_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
);
DO $$ BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='maxtravel_app') THEN
    GRANT SELECT,INSERT,UPDATE ON flight_route_catalogue,flight_route_discovery_checkpoint TO maxtravel_app;
  END IF;
END $$;
