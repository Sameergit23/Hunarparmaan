CREATE TABLE "ai_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"engine" text NOT NULL,
	"checks" jsonb NOT NULL,
	"unsupported" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_results_evidence_engine" UNIQUE("evidence_id","engine")
);
--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_results_session" ON "ai_results" USING btree ("session_id");