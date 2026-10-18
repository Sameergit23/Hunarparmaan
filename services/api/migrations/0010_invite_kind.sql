-- TRD D-6: an admin's PIN reset is a one-time code like an invite, in the same table.
ALTER TABLE "account_invites" ADD COLUMN "kind" text DEFAULT 'invite' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_invites" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;