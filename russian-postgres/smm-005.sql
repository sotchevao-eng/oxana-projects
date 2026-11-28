BEGIN;
CREATE TABLE smm.tsg_callback_events (
 post_id bigint PRIMARY KEY CHECK(post_id>0),
 received_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON smm.tsg_callback_events FROM PUBLIC;
COMMIT;
-- Test database only: GRANT SELECT, INSERT ON smm.tsg_callback_events TO smm_test_runtime;
