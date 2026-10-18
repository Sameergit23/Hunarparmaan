-- A separate database for the API tests on PostgreSQL (TEST_DATABASE_URL).
-- The tests delete everything in it, so it is never the dev database.
-- Runs once, when the postgres-data volume is first created.
CREATE DATABASE hp_test OWNER hp;
