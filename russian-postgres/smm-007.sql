BEGIN;
ALTER TABLE smm.municipal_checks DROP CONSTRAINT municipal_checks_source_id_check,
 ADD CONSTRAINT municipal_checks_source_id_check CHECK(source_id IN ('water-ryazan','city-ryazan','rgres-ryazan','gas-ryazan'));
ALTER TABLE smm.municipal_notices DROP CONSTRAINT municipal_notices_source_id_check,
 ADD CONSTRAINT municipal_notices_source_id_check CHECK(source_id IN ('water-ryazan','city-ryazan','rgres-ryazan','gas-ryazan'));
COMMIT;
