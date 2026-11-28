BEGIN;
CREATE TABLE smm.personal_smoke (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 owner_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','completed','uncertain')),
 total_tokens integer CHECK(total_tokens>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 CHECK ((state='completed' AND total_tokens IS NOT NULL) OR (state<>'completed' AND total_tokens IS NULL))
);
REVOKE ALL ON smm.personal_smoke FROM PUBLIC;
COMMIT;
-- Test DB only: GRANT SELECT,INSERT,UPDATE ON smm.personal_smoke TO smm_test_runtime;
-- No DELETE, no automatic reset. Unknown provider outcome remains blocked.
