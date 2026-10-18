CREATE TABLE "account_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"organisation_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"replaced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"subject_id" text NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "admin_events_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
ALTER TABLE "account_invites" ADD CONSTRAINT "account_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_invites_phone" ON "account_invites" USING btree ("phone","created_at");