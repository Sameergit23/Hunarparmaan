-- Rule 4 in CLAUDE.md and ADR 010: the admin log is append-only, like the other event tables (see 0001).
CREATE TRIGGER admin_events_append_only BEFORE UPDATE OR DELETE ON "admin_events" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER admin_events_no_truncate BEFORE TRUNCATE ON "admin_events" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
