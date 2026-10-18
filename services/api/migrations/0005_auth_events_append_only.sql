-- Rule 4 in CLAUDE.md: the sign-in log is append-only, like the other event tables (see 0001).
CREATE TRIGGER auth_events_append_only BEFORE UPDATE OR DELETE ON "auth_events" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER auth_events_no_truncate BEFORE TRUNCATE ON "auth_events" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
