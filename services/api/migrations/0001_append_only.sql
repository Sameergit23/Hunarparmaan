-- Rule 4 in CLAUDE.md: scores, evidence and audit entries are append-only.
-- These tables accept INSERT only; a correction is a new row.
CREATE OR REPLACE FUNCTION hp_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_entries_append_only BEFORE UPDATE OR DELETE ON "audit_entries" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER audit_entries_no_truncate BEFORE TRUNCATE ON "audit_entries" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER trade_packs_append_only BEFORE UPDATE OR DELETE ON "trade_packs" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER trade_packs_no_truncate BEFORE TRUNCATE ON "trade_packs" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER consents_append_only BEFORE UPDATE OR DELETE ON "consents" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER consents_no_truncate BEFORE TRUNCATE ON "consents" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER consent_withdrawals_append_only BEFORE UPDATE OR DELETE ON "consent_withdrawals" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER consent_withdrawals_no_truncate BEFORE TRUNCATE ON "consent_withdrawals" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER declarations_append_only BEFORE UPDATE OR DELETE ON "declarations" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER declarations_no_truncate BEFORE TRUNCATE ON "declarations" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER mapping_results_append_only BEFORE UPDATE OR DELETE ON "mapping_results" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER mapping_results_no_truncate BEFORE TRUNCATE ON "mapping_results" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER route_decisions_append_only BEFORE UPDATE OR DELETE ON "route_decisions" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER route_decisions_no_truncate BEFORE TRUNCATE ON "route_decisions" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER sessions_append_only BEFORE UPDATE OR DELETE ON "sessions" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER sessions_no_truncate BEFORE TRUNCATE ON "sessions" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER calibration_scores_append_only BEFORE UPDATE OR DELETE ON "calibration_scores" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER calibration_scores_no_truncate BEFORE TRUNCATE ON "calibration_scores" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER evidence_append_only BEFORE UPDATE OR DELETE ON "evidence" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER evidence_no_truncate BEFORE TRUNCATE ON "evidence" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER evidence_checks_append_only BEFORE UPDATE OR DELETE ON "evidence_checks" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER evidence_checks_no_truncate BEFORE TRUNCATE ON "evidence_checks" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER scores_append_only BEFORE UPDATE OR DELETE ON "scores" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER scores_no_truncate BEFORE TRUNCATE ON "scores" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER recommendations_append_only BEFORE UPDATE OR DELETE ON "recommendations" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER recommendations_no_truncate BEFORE TRUNCATE ON "recommendations" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER approvals_append_only BEFORE UPDATE OR DELETE ON "approvals" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON "approvals" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER certificates_append_only BEFORE UPDATE OR DELETE ON "certificates" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER certificates_no_truncate BEFORE TRUNCATE ON "certificates" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER flags_append_only BEFORE UPDATE OR DELETE ON "flags" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER flags_no_truncate BEFORE TRUNCATE ON "flags" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER flag_reviews_append_only BEFORE UPDATE OR DELETE ON "flag_reviews" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER flag_reviews_no_truncate BEFORE TRUNCATE ON "flag_reviews" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER rescore_tasks_append_only BEFORE UPDATE OR DELETE ON "rescore_tasks" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER rescore_tasks_no_truncate BEFORE TRUNCATE ON "rescore_tasks" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER rescores_append_only BEFORE UPDATE OR DELETE ON "rescores" FOR EACH ROW EXECUTE FUNCTION hp_forbid_change();
--> statement-breakpoint
CREATE TRIGGER rescores_no_truncate BEFORE TRUNCATE ON "rescores" FOR EACH STATEMENT EXECUTE FUNCTION hp_forbid_change();
