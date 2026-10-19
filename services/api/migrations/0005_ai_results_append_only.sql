-- Rule 4: AI results are append-only, like the other event tables (see 0001_append_only.sql).
CREATE TRIGGER ai_results_append_only BEFORE UPDATE OR DELETE ON "ai_results" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER ai_results_no_truncate BEFORE TRUNCATE ON "ai_results" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
