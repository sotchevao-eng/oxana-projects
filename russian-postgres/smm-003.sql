BEGIN;
CREATE TABLE smm.studio_requests (
 owner_id text NOT NULL,
 request_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode='simulation'),
 reserved_tokens integer NOT NULL CHECK(reserved_tokens BETWEEN 1 AND 4000),
 actual_tokens integer CHECK(actual_tokens BETWEEN 0 AND reserved_tokens),
 state text NOT NULL CHECK(state IN ('reserved','completed','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,request_id)
);
CREATE INDEX studio_requests_owner_created ON smm.studio_requests(owner_id,created_at);
CREATE UNIQUE INDEX studio_one_active ON smm.studio_requests(owner_id) WHERE state='reserved';
REVOKE ALL ON smm.studio_requests FROM PUBLIC;
COMMIT;
-- Test DB only: GRANT SELECT,INSERT,UPDATE ON smm.studio_requests TO smm_test_runtime;
-- Simulation counts are not provider usage and must never be reported as billed tokens.
