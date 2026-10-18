-- ADR 010: every account belongs to one organisation. The pilot's organisations get fixed ids
-- (PILOT_ORGANISATIONS in src/domain/organisations.ts), and existing accounts and invites are
-- placed in the one that holds their role, so databases made before organisations keep working.
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"recognition_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "qp_owners" (
	"nqr_code" text PRIMARY KEY NOT NULL,
	"organisation_id" uuid NOT NULL
);
--> statement-breakpoint
INSERT INTO "organisations" ("id", "kind", "name") VALUES
	('00000000-0000-4000-8000-000000000101', 'operator', '{"en": "HunarPramaan", "hi": "हुनर प्रमाण"}'),
	('00000000-0000-4000-8000-000000000102', 'awarding_body', '{"en": "CSDCI", "hi": "CSDCI"}'),
	('00000000-0000-4000-8000-000000000103', 'assessment_agency', '{"en": "Indore Assessment Agency", "hi": "इंदौर असेसमेंट एजेंसी"}'),
	('00000000-0000-4000-8000-000000000104', 'training_partner', '{"en": "Indore RPL Centre", "hi": "इंदौर RPL केंद्र"}'),
	('00000000-0000-4000-8000-000000000105', 'regulator', '{"en": "NCVET", "hi": "NCVET"}');
--> statement-breakpoint
INSERT INTO "qp_owners" ("nqr_code", "organisation_id") VALUES
	('QG-03-CO-03951-2025-V2-CSDCI', '00000000-0000-4000-8000-000000000102'),
	('QG-04-CO-03952-2025-V2-CSDCI', '00000000-0000-4000-8000-000000000102');
--> statement-breakpoint
-- The admin log's entries are ids and reason codes. The bootstrap's actor is its own invite, not
-- an account, so the actor has no foreign key; `subject_kind` lets the Audit log link each row.
ALTER TABLE "admin_events" DROP CONSTRAINT "admin_events_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_events" ADD COLUMN "subject_kind" text DEFAULT 'invite' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_events" ALTER COLUMN "subject_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_invites" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
UPDATE "account_invites" SET "organisation_id" = CASE
	WHEN "role" = 'platform_admin' THEN '00000000-0000-4000-8000-000000000101'::uuid
	WHEN "role" IN ('ab_admin', 'awarding_body', 'master_assessor') THEN '00000000-0000-4000-8000-000000000102'::uuid
	WHEN "role" IN ('agency_admin', 'agency', 'assessor') THEN '00000000-0000-4000-8000-000000000103'::uuid
	WHEN "role" IN ('tp_admin', 'mobiliser', 'worker') THEN '00000000-0000-4000-8000-000000000104'::uuid
	ELSE '00000000-0000-4000-8000-000000000105'::uuid
END;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
UPDATE "users" SET "organisation_id" = CASE
	WHEN "role" = 'platform_admin' THEN '00000000-0000-4000-8000-000000000101'::uuid
	WHEN "role" IN ('ab_admin', 'awarding_body', 'master_assessor') THEN '00000000-0000-4000-8000-000000000102'::uuid
	WHEN "role" IN ('agency_admin', 'agency', 'assessor') THEN '00000000-0000-4000-8000-000000000103'::uuid
	WHEN "role" IN ('tp_admin', 'mobiliser', 'worker') THEN '00000000-0000-4000-8000-000000000104'::uuid
	ELSE '00000000-0000-4000-8000-000000000105'::uuid
END;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organisation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "qp_owners" ADD CONSTRAINT "qp_owners_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
