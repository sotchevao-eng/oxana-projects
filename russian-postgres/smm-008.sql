BEGIN;
CREATE TABLE smm.municipal_notification_reads (
 owner_id uuid NOT NULL,
 source_id text NOT NULL,
 url text NOT NULL,
 seen_version timestamptz NOT NULL,
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,source_id,url),
 FOREIGN KEY(owner_id,source_id,url) REFERENCES smm.municipal_notices(owner_id,source_id,url)
);
REVOKE ALL ON smm.municipal_notification_reads FROM PUBLIC;
COMMIT;
-- Runtime: GRANT SELECT,INSERT,UPDATE ON smm.municipal_notification_reads TO smm_test_runtime;
