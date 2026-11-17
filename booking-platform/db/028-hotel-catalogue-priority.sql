-- Preserve one interrupted country cursor while India is imported first.
-- This changes only the booking catalogue checkpoint, never supplier bookings.
ALTER TABLE hotel_catalogue_sync ADD COLUMN deferred_country jsonb;
ALTER TABLE hotel_catalogue_sync ADD CONSTRAINT hotel_catalogue_deferred_country_valid CHECK (
  deferred_country IS NULL OR (
    jsonb_typeof(deferred_country) = 'object'
    AND jsonb_typeof(deferred_country->'countryName') = 'string'
    AND length(deferred_country->>'countryName') BETWEEN 2 AND 120
    AND jsonb_typeof(deferred_country->'mappingPage') = 'number'
    AND (deferred_country->>'mappingPage') ~ '^(0|[1-9][0-9]{0,4}|100000)$'
    AND (NOT (deferred_country ? 'lastMappingHash') OR (
      jsonb_typeof(deferred_country->'lastMappingHash') = 'string'
      AND (deferred_country->>'lastMappingHash') ~ '^[0-9a-f]{64}$'
    ))
    AND deferred_country ?& ARRAY['countryName','mappingPage']
  )
);
