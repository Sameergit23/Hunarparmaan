-- ADR 010 points 6 and 7 (IT-05): each session records the assessor's organisation and the QP's
-- owner, copied when it is projected. Sessions are append-only (rule 4), so the backfill of
-- these two derived columns, for sessions synced before this, runs with the trigger off for
-- this one statement. No event is changed: the hash-chained audit entries stay as they were.
ALTER TABLE "sessions" ADD COLUMN "agency_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE TRIGGER "sessions_append_only";--> statement-breakpoint
UPDATE "sessions" SET
	"agency_id" = (SELECT "organisation_id" FROM "users" WHERE "users"."id" = "sessions"."assessor_id"),
	"owner_id" = (SELECT "organisation_id" FROM "qp_owners" WHERE "qp_owners"."nqr_code" = "sessions"."nqr_code");--> statement-breakpoint
ALTER TABLE "sessions" ENABLE TRIGGER "sessions_append_only";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agency_id_organisations_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_organisations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_agency" ON "sessions" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "sessions_owner" ON "sessions" USING btree ("owner_id");
