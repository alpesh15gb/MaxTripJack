CREATE TABLE request_buckets(user_id text NOT NULL,scope text NOT NULL,bucket timestamptz NOT NULL,hits integer NOT NULL DEFAULT 1,PRIMARY KEY(user_id,scope,bucket));
CREATE INDEX request_buckets_expiry ON request_buckets(bucket);
CREATE TABLE worker_heartbeats(name text PRIMARY KEY,last_seen timestamptz NOT NULL DEFAULT now());
