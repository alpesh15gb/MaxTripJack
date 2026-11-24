CREATE INDEX IF NOT EXISTS hotel_catalogue_photo_order_idx
  ON hotel_catalogue (
    environment,
    (CASE WHEN jsonb_typeof(content->'photos')='array' THEN jsonb_array_length(content->'photos')>0 ELSE false END) DESC,
    name,
    hotel_id
  )
  WHERE active = true AND content_ready = true;
