ALTER TABLE pricing_rules ADD COLUMN service_fee_basis_points integer NOT NULL DEFAULT 0 CHECK(service_fee_basis_points BETWEEN 0 AND 10000);
CREATE TABLE promo_codes (
 id uuid PRIMARY KEY, code text UNIQUE NOT NULL CHECK(code ~ '^[A-Z0-9_-]{3,32}$'),
 product text NOT NULL CHECK(product IN ('ALL','FLIGHT','HOTEL')),
 discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 discount_basis_points integer NOT NULL DEFAULT 0 CHECK(discount_basis_points BETWEEN 0 AND 10000),
 minimum_minor bigint NOT NULL DEFAULT 0 CHECK(minimum_minor>=0),
 maximum_discount_minor bigint CHECK(maximum_discount_minor>0),
 expires_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((discount_minor>0 AND discount_basis_points=0) OR (discount_minor=0 AND discount_basis_points>0))
);
ALTER TABLE supplier_quotes ADD COLUMN promo_code_id uuid REFERENCES promo_codes(id),
 ADD COLUMN undiscounted_minor bigint, ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0);
ALTER TABLE orders ADD COLUMN promo_snapshot jsonb;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='maxtravel_app') THEN
  GRANT SELECT,INSERT,UPDATE ON promo_codes TO maxtravel_app;
 END IF;
END $$;
