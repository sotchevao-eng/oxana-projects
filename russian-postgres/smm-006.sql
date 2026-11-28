BEGIN;
CREATE TABLE smm.municipal_checks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id uuid NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 source_id text NOT NULL CHECK(source_id IN ('water-ryazan','city-ryazan')),
 status text NOT NULL CHECK(status IN ('links_found','parser_review','unavailable')),
 diagnostic text CHECK(length(diagnostic)<=64),
 link_count integer NOT NULL CHECK(link_count BETWEEN 0 AND 10),
 article_count integer NOT NULL CHECK(article_count BETWEEN 0 AND 10)
);
CREATE INDEX municipal_checks_owner_time ON smm.municipal_checks(owner_id,checked_at DESC,id DESC);
CREATE TABLE smm.municipal_notices (
 owner_id uuid NOT NULL,
 source_id text NOT NULL CHECK(source_id IN ('water-ryazan','city-ryazan')),
 url text NOT NULL CHECK(length(url)<=2000),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
 title_date date,
 address_match text NOT NULL CHECK(address_match IN ('exact_house','street_review','no_match','unknown')),
 first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL DEFAULT now(),
 last_changed timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,source_id,url)
);
CREATE INDEX municipal_notices_owner_time ON smm.municipal_notices(owner_id,last_seen DESC);
REVOKE ALL ON smm.municipal_checks,smm.municipal_notices FROM PUBLIC;
REVOKE ALL ON SEQUENCE smm.municipal_checks_id_seq FROM PUBLIC;
COMMIT;
-- Runtime: SELECT, INSERT on checks; SELECT, INSERT, UPDATE on notices;
-- USAGE on municipal_checks_id_seq. Never grant DELETE.
