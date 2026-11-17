/** Match migration029's normalization without deleting Indic/other script marks.
 * This is accent/case/punctuation folding, not transliteration or fuzzy matching.
 */
export function normaliseHotelSearch(value:string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase()
    .replace(/[\s\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e\u2010-\u2027\u2030-\u205e\u2e00-\u2e7f]+/gu,' ').trim();
}

/** At most100 input characters and48 directed splits; all remain SQL parameters. */
export function hotelSearchContext(input:string) {
  const text=normaliseHotelSearch(input.trim().slice(0,100));
  const words=text.split(' ').filter(word=>/[\p{L}\p{N}]/u.test(word));
  if(!words.length||words.length>25)return undefined;
  const nameParts:string[]=[],placeParts:string[]=[];
  for(let index=1;index<words.length;index++) {
    const before=words.slice(0,index).join(' '),after=words.slice(index).join(' ');
    nameParts.push(before,after);placeParts.push(after,before);
  }
  return {text:words.join(' '),nameParts,placeParts};
}

/** Only candidates passing the GIN document match are scored. The same CTE is
 * used for page rows and their total, so filtering cannot create empty pages.
 */
export function hotelSearchCtes(baseWhere:string) {
  // Country is an exact field, never another loose keyword. For each existing
  // split allow at most two additional scopes; locality rules remain unchanged.
  const withoutCountry=(field:string)=>`CASE WHEN search_country<>'' THEN CASE
    WHEN left(${field},length(search_country)+1)=search_country||' ' THEN substr(${field},length(search_country)+2)
    WHEN right(${field},length(search_country)+1)=' '||search_country THEN left(${field},length(${field})-length(search_country)-1)
    END END`;
  return `WITH candidates AS MATERIALIZED (
    SELECT hotel_id,name,search_name,search_city,search_country,to_tsvector('simple',search_name) AS name_document,
      to_tsvector('simple',search_city||' '||search_country) AS place_document,
      to_tsvector('simple',search_address) AS address_document
    FROM hotel_catalogue WHERE ${baseWhere}
      AND search_normalized_document @@ plainto_tsquery('simple',$3)
  ), scored AS (
    SELECT hotel_id,name,LEAST(
      CASE WHEN search_name=$3 OR strip(name_document)=strip(to_tsvector('simple',$3)) THEN 0 WHEN search_city=$3 THEN 1 WHEN search_country=$3 THEN 2
        WHEN name_document @@ phraseto_tsquery('simple',$3) THEN 4
        WHEN place_document @@ phraseto_tsquery('simple',$3) THEN 5
        WHEN name_document @@ plainto_tsquery('simple',$3) THEN 8
        WHEN address_document @@ phraseto_tsquery('simple',$3) THEN 9 ELSE 99 END,
      COALESCE((SELECT min(CASE
        WHEN strip(name_document)=strip(to_tsvector('simple',part.hotel)) AND (search_city=part.place OR search_country=part.place) THEN 3
        WHEN strip(name_document)=strip(to_tsvector('simple',part.hotel)) THEN 6 ELSE 7 END)
        FROM unnest($4::text[],$5::text[]) AS raw_part(hotel,place)
        CROSS JOIN LATERAL (VALUES(raw_part.hotel,raw_part.place),
          (${withoutCountry('raw_part.hotel')},raw_part.place),
          (raw_part.hotel,${withoutCountry('raw_part.place')})) AS part(hotel,place)
        WHERE part.hotel IS NOT NULL AND part.place IS NOT NULL
          AND name_document @@ plainto_tsquery('simple',part.hotel)
          AND (search_city=part.place OR search_country=part.place
            OR (position(' ' in part.place)>0 AND
              (place_document @@ phraseto_tsquery('simple',part.place) OR address_document @@ phraseto_tsquery('simple',part.place)))
            OR (strip(name_document)=strip(to_tsvector('simple',part.hotel)) AND address_document @@ phraseto_tsquery('simple',part.place)))
      ),99)
    ) AS search_rank FROM candidates
  )`;
}
