CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"device_id" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"token_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	CONSTRAINT "renewal_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "ticket_hash" text;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "ticket_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "ticket_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_pin_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lockouts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "worker_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_keys" ADD CONSTRAINT "renewal_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_keys" ADD CONSTRAINT "renewal_keys_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_user_type_at" ON "auth_events" USING btree ("user_id","type","occurred_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_created" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_ip_created" ON "otp_challenges" USING btree ("ip_hash","created_at");--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_ticket_hash_unique" UNIQUE("ticket_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_worker_id_unique" UNIQUE("worker_id");