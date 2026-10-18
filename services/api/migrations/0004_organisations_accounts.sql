CREATE TABLE "admin_events" (
	"seq" integer PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"org_id" uuid,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"reason" text,
	"at" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "admin_events_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_reason" text,
	"suspended_by" uuid,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "pin_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "lost_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org_id" uuid;--> statement-breakpoint
-- Backfill (ADR 010). Before this migration a database held only the Sprint 0 demo pilot, so
-- each existing account joins the pilot organisation for its role, with the names pnpm db:seed
-- uses. A database without accounts (staging, production) gets no organisations here. An
-- account with a role not listed stays without one, and SET NOT NULL below stops the migration.
INSERT INTO "organisations" ("id", "name", "kind")
SELECT gen_random_uuid(), m."org_name", m."org_kind"
FROM (VALUES
  ('worker', 'Indore RPL Centre', 'training_partner'),
  ('mobiliser', 'Indore RPL Centre', 'training_partner'),
  ('assessor', 'Indore Assessment Agency', 'assessment_agency'),
  ('agency', 'Indore Assessment Agency', 'assessment_agency'),
  ('master_assessor', 'CSDCI', 'awarding_body'),
  ('awarding_body', 'CSDCI', 'awarding_body'),
  ('ncvet', 'NCVET', 'regulator')
) AS m("role", "org_name", "org_kind")
WHERE m."role" IN (SELECT DISTINCT "role" FROM "users")
GROUP BY m."org_name", m."org_kind";--> statement-breakpoint
UPDATE "users" SET "org_id" = o."id"
FROM (VALUES
  ('worker', 'Indore RPL Centre', 'training_partner'),
  ('mobiliser', 'Indore RPL Centre', 'training_partner'),
  ('assessor', 'Indore Assessment Agency', 'assessment_agency'),
  ('agency', 'Indore Assessment Agency', 'assessment_agency'),
  ('master_assessor', 'CSDCI', 'awarding_body'),
  ('awarding_body', 'CSDCI', 'awarding_body'),
  ('ncvet', 'NCVET', 'regulator')
) AS m("role", "org_name", "org_kind")
JOIN "organisations" o ON o."name" = m."org_name"
WHERE m."role" = "users"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_pins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
-- Every account that existed before could sign in.
UPDATE "users" SET "activated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivation_reason" text;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_events_org" ON "admin_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "auth_events_user" ON "auth_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "invites_account" ON "invites" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deactivated_by_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_challenges_phone" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_live" ON "users" USING btree ("phone") WHERE "users"."status" <> 'draining';--> statement-breakpoint
CREATE INDEX "users_org" ON "users" USING btree ("org_id");