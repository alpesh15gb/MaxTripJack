export const UPSERT_FLIGHT_ROUTE_SQL=`INSERT INTO flight_route_catalogue
  (origin_code,destination_code,canonical_slug,source_url,source_environment,source_kind,verified_at,notes,active,content_ready)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  ON CONFLICT(origin_code,destination_code) DO UPDATE SET
    source_url=EXCLUDED.source_url,source_environment=EXCLUDED.source_environment,source_kind=EXCLUDED.source_kind,
    verified_at=EXCLUDED.verified_at,notes=EXCLUDED.notes,active=EXCLUDED.active,content_ready=EXCLUDED.content_ready,
    updated_at=CASE WHEN (flight_route_catalogue.source_url,flight_route_catalogue.notes,flight_route_catalogue.active,flight_route_catalogue.source_environment,flight_route_catalogue.content_ready)
      IS DISTINCT FROM (EXCLUDED.source_url,EXCLUDED.notes,EXCLUDED.active,EXCLUDED.source_environment,EXCLUDED.content_ready)
      THEN now() ELSE flight_route_catalogue.updated_at END
  WHERE EXCLUDED.verified_at>=flight_route_catalogue.verified_at
    AND (EXCLUDED.source_kind='manifest' OR flight_route_catalogue.source_kind='observed')
    AND (EXCLUDED.source_environment='production' OR flight_route_catalogue.source_environment='uat')`;

export const INDEXABLE_FLIGHT_ROUTE_WHERE="active=true AND content_ready=true AND source_environment='production' AND verified_at>=now()-interval '180 days' AND verified_at<=now()+interval '5 minutes' AND length(notes)>=80";
