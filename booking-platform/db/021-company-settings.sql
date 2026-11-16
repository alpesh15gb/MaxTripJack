CREATE TABLE company_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pricing_rules ADD COLUMN margin_basis_points integer NOT NULL DEFAULT 0 CHECK(margin_basis_points BETWEEN 0 AND 9500);
ALTER TABLE pricing_rules ADD CONSTRAINT pricing_percentage_mode CHECK(margin_basis_points=0 OR markup_basis_points=0);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maxtravel_app') THEN
  GRANT SELECT,INSERT,UPDATE ON company_settings TO maxtravel_app;
 END IF;
END $$;
