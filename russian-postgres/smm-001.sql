-- SMM v0.2. Apply only to isolated Russian PostgreSQL after review.
BEGIN;
CREATE SCHEMA IF NOT EXISTS smm;
REVOKE ALL ON SCHEMA smm FROM PUBLIC;
CREATE TABLE smm.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  editorial_policy text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,id)
);
CREATE TABLE smm.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  community_id uuid NOT NULL,
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,community_id) REFERENCES smm.communities(owner_id,id)
);
CREATE TABLE smm.post_versions (
  owner_id text NOT NULL,
  post_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,post_id,version),
  FOREIGN KEY(owner_id,post_id) REFERENCES smm.posts(owner_id,id)
);
ALTER TABLE smm.posts ADD CONSTRAINT current_version_exists
  FOREIGN KEY(owner_id,id,current_version)
  REFERENCES smm.post_versions(owner_id,post_id,version)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE smm.approvals (
  owner_id text NOT NULL,
  post_id uuid NOT NULL,
  version integer NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,post_id,version),
  FOREIGN KEY(owner_id,post_id,version) REFERENCES smm.post_versions(owner_id,post_id,version)
);
CREATE TABLE smm.budget_limits (
  owner_id text PRIMARY KEY,
  monthly_limit_kopecks bigint NOT NULL DEFAULT 0 CHECK(monthly_limit_kopecks >= 0)
);
CREATE TABLE smm.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id text NOT NULL,
  action text NOT NULL,
  subject_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA smm FROM PUBLIC;
-- Runtime role must receive explicit minimal grants after review.
-- No publication queue, no external API tokens, no paid calls in this revision.
COMMIT;
