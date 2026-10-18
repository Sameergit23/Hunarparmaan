-- ADR 010 point 8: accounts and phones get a status. Deactivated accounts and retired phones
-- drain; a lost phone is refused. A closed account frees its number for a new account.
ALTER TABLE "users" DROP CONSTRAINT "users_phone_unique";--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "status" text DEFAULT 'registered' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
CREATE INDEX "devices_user_status" ON "devices" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_open" ON "users" USING btree ("phone") WHERE "users"."status" <> 'closed';--> statement-breakpoint
CREATE INDEX "users_organisation_status" ON "users" USING btree ("organisation_id","status");--> statement-breakpoint
-- Nothing set revoked_at before this, but a phone that has it was taken out of use.
UPDATE "devices" SET "status" = 'retired', "status_changed_at" = "revoked_at" WHERE "revoked_at" IS NOT NULL;
