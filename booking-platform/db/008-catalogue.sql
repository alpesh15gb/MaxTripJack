CREATE TABLE hotel_destinations(region_id text PRIMARY KEY,name text NOT NULL,country text NOT NULL,label text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX hotel_destinations_name ON hotel_destinations(lower(name) text_pattern_ops);
