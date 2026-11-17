-- Public static property facts only: no inventory, prices, search sessions or guest data.
CREATE TABLE hotel_catalogue (
  environment text NOT NULL CHECK (environment IN ('uat','production')),
  hotel_id text NOT NULL CHECK (hotel_id ~ '^[1-9][0-9]{0,29}$'),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 150),
  name text NOT NULL,
  city text NOT NULL,
  country_name text NOT NULL,
  address text NOT NULL,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL,
  content_ready boolean NOT NULL,
  content_updated_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  search_document tsvector GENERATED ALWAYS AS (to_tsvector('simple', name || ' ' || city || ' ' || country_name || ' ' || address)) STORED,
  PRIMARY KEY (environment, hotel_id),
  UNIQUE (environment, slug)
);
CREATE INDEX hotel_catalogue_public ON hotel_catalogue(environment, active, content_ready, hotel_id);
CREATE INDEX hotel_catalogue_search ON hotel_catalogue USING gin(search_document);
CREATE INDEX hotel_catalogue_checked ON hotel_catalogue(environment, checked_at);

CREATE TABLE hotel_catalogue_discovery (
  environment text NOT NULL CHECK (environment IN ('uat','production')),
  hotel_id text NOT NULL CHECK (hotel_id ~ '^[1-9][0-9]{0,29}$'),
  country_name text NOT NULL,
  seen_generation integer NOT NULL CHECK (seen_generation > 0),
  content_generation integer NOT NULL DEFAULT 0 CHECK (content_generation >= 0),
  content_attempts integer NOT NULL DEFAULT 0 CHECK (content_attempts >= 0),
  next_content_attempt timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, hotel_id)
);
CREATE INDEX hotel_catalogue_discovery_generation ON hotel_catalogue_discovery(environment, seen_generation, content_generation);

-- A country snapshot and in-page content cursor make imports restartable without losing hotels.
CREATE TABLE hotel_catalogue_sync (
  environment text PRIMARY KEY CHECK (environment IN ('uat','production')),
  countries jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(countries) = 'array'),
  country_index integer NOT NULL DEFAULT 0 CHECK (country_index >= 0),
  mapping_page integer NOT NULL DEFAULT 0 CHECK (mapping_page >= 0),
  pending_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(pending_ids) = 'array' AND jsonb_array_length(pending_ids) <= 2000),
  content_offset integer NOT NULL DEFAULT 0 CHECK (content_offset BETWEEN 0 AND 2000),
  mapping_has_more boolean NOT NULL DEFAULT false,
  page_loaded boolean NOT NULL DEFAULT false,
  last_mapping_hash text CHECK (last_mapping_hash IS NULL OR last_mapping_hash ~ '^[0-9a-f]{64}$'),
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  mapped_count bigint NOT NULL DEFAULT 0 CHECK (mapped_count >= 0),
  content_count bigint NOT NULL DEFAULT 0 CHECK (content_count >= 0),
  missing_count bigint NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  last_error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maxtravel_app') THEN
    GRANT SELECT, INSERT, UPDATE ON hotel_catalogue, hotel_catalogue_sync, hotel_catalogue_discovery TO maxtravel_app;
  END IF;
END $$;
