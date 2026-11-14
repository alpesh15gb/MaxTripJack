CREATE TABLE auth_phone_challenges (
  identifier text PRIMARY KEY CHECK (identifier ~ '^[0-9a-f]{64}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('signin','link')),
  binding text CHECK (binding IS NULL OR binding ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  CHECK ((purpose='signin' AND binding IS NULL) OR (purpose='link' AND binding IS NOT NULL))
);
CREATE INDEX auth_phone_challenges_expiry ON auth_phone_challenges(expires_at);
