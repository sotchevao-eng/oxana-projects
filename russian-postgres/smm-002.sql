-- Apply as schema owner, only to the isolated SMM test database.
BEGIN;
CREATE TABLE smm.plan_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id text NOT NULL,
 community_id uuid NOT NULL,
 topic text NOT NULL CHECK(length(topic) BETWEEN 1 AND 500),
 planned_date date NOT NULL,
 planned_time time(0) NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,community_id) REFERENCES smm.communities(owner_id,id)
);
CREATE INDEX plan_items_owner_date_idx ON smm.plan_items(owner_id,planned_date);
REVOKE ALL ON smm.plan_items FROM PUBLIC;
COMMIT;
-- In Timeweb test DB only, as schema owner:
-- GRANT SELECT,INSERT,UPDATE ON smm.plan_items TO smm_test_runtime;
-- Dates/times are Moscow editorial wall-clock values, not a publication queue.
