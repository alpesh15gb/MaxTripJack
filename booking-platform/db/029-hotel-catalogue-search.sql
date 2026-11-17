-- Keep query words in their hotel/location context, with an indexed accent-folded
-- candidate document. Supplier facts and canonical URLs are preserved; no extension
-- or live supplier lookup is needed. Stored projections backfill existing rows.
CREATE FUNCTION hotel_catalogue_search_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    lower(normalize(regexp_replace(normalize(value,NFKD), U&'[\0300-\036f]', '', 'g'),NFC)),
    U&'[[:space:]\0021-\002f\003a-\0040\005b-\0060\007b-\007e\2010-\2027\2030-\205e\2e00-\2e7f]+', ' ', 'g'))
$$;

ALTER TABLE hotel_catalogue
  ADD COLUMN search_name text GENERATED ALWAYS AS (hotel_catalogue_search_text(name)) STORED,
  ADD COLUMN search_city text GENERATED ALWAYS AS (hotel_catalogue_search_text(city)) STORED,
  ADD COLUMN search_country text GENERATED ALWAYS AS (hotel_catalogue_search_text(country_name)) STORED,
  ADD COLUMN search_address text GENERATED ALWAYS AS (hotel_catalogue_search_text(address)) STORED,
  ADD COLUMN search_normalized_document tsvector GENERATED ALWAYS AS
    (to_tsvector('simple',hotel_catalogue_search_text(name || ' ' || city || ' ' || country_name || ' ' || address))) STORED;
CREATE INDEX hotel_catalogue_search_normalized ON hotel_catalogue USING gin(search_normalized_document);
