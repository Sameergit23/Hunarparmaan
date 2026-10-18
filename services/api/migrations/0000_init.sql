CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_recommendation_id_unique" UNIQUE("recommendation_id")
);
--> statement-breakpoint
CREATE TABLE "audit_entries" (
	"device_id" text NOT NULL,
	"seq" integer NOT NULL,
	"id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor" jsonb NOT NULL,
	"occurred_at" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_entries_device_id_seq_pk" PRIMARY KEY("device_id","seq"),
	CONSTRAINT "audit_entries_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "calibration_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"calibration_run_id" uuid NOT NULL,
	"clip_id" text NOT NULL,
	"criterion_id" text NOT NULL,
	"value" integer NOT NULL,
	"assessor_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"nqr_code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_recommendation_id_unique" UNIQUE("recommendation_id")
);
--> statement-breakpoint
CREATE TABLE "consent_withdrawals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"consent_id" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_id" uuid NOT NULL,
	"notice_version" text NOT NULL,
	"language" text NOT NULL,
	"read_aloud" boolean NOT NULL,
	"given_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria" (
	"nqr_code" text NOT NULL,
	"id" text NOT NULL,
	"nos_code" text NOT NULL,
	"text" jsonb NOT NULL,
	"marks" integer NOT NULL,
	"rubric" jsonb NOT NULL,
	"glossary" jsonb NOT NULL,
	CONSTRAINT "criteria_nqr_code_id_pk" PRIMARY KEY("nqr_code","id")
);
--> statement-breakpoint
CREATE TABLE "declarations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_id" uuid NOT NULL,
	"language" text NOT NULL,
	"source" text NOT NULL,
	"asr_transcript" text NOT NULL,
	"transcript" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"duration_sec" double precision,
	"captured_at" timestamp with time zone NOT NULL,
	"gps" jsonb NOT NULL,
	"device_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"status" text NOT NULL,
	"actual_sha256" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flag_id" uuid NOT NULL,
	"note" text NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_reviews_flag_id_unique" UNIQUE("flag_id")
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"session_id" uuid,
	"evidence_id" uuid,
	"device_id" text,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"declaration_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"pack_version" text NOT NULL,
	"results" jsonb NOT NULL,
	"suggested_nqr_code" text,
	"suggested_route" text NOT NULL,
	"needs_review" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nos" (
	"nqr_code" text NOT NULL,
	"code" text NOT NULL,
	"title" jsonb NOT NULL,
	"weight" double precision NOT NULL,
	CONSTRAINT "nos_nqr_code_code_pk" PRIMARY KEY("nqr_code","code")
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"nqr_code" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"pack_version" text NOT NULL,
	"title" jsonb NOT NULL,
	"nsqf_level" integer NOT NULL,
	"awarding_body" text NOT NULL,
	"pass_rule" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"nqr_code" text NOT NULL,
	"pack_version" text NOT NULL,
	"outcome" text NOT NULL,
	"aggregate" double precision NOT NULL,
	"nos_totals" jsonb NOT NULL,
	"score_event_ids" jsonb NOT NULL,
	"signed_by" uuid NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rescore_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rescore_tasks_evidence" UNIQUE("evidence_id")
);
--> statement-breakpoint
CREATE TABLE "rescores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"master_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rescores_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "route_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"declaration_id" uuid NOT NULL,
	"nqr_code" text NOT NULL,
	"route" text NOT NULL,
	"suggested" jsonb,
	"reason" text,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"value" integer NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"ai_flags" jsonb NOT NULL,
	"conflict_reason" text,
	"supersedes" uuid,
	"assessor_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"worker_id" uuid NOT NULL,
	"assessor_id" uuid NOT NULL,
	"nqr_code" text NOT NULL,
	"pack_version" text NOT NULL,
	"ekyc_ref" text NOT NULL,
	"start_photo_sha256" text NOT NULL,
	"gps" jsonb NOT NULL,
	"device_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_rounds" (
	"round" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"fleiss_kappa" double precision NOT NULL,
	"kappa_ci_low" double precision NOT NULL,
	"kappa_ci_high" double precision NOT NULL,
	"krippendorff_alpha" double precision NOT NULL,
	"exact_agreement" double precision NOT NULL,
	"raters" integer NOT NULL,
	"clips" integer NOT NULL,
	"demo" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_packs" (
	"id" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"sha256" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_packs_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"pin_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"language" text NOT NULL,
	"ekyc_ref" text,
	"registered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_scores" ADD CONSTRAINT "calibration_scores_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_withdrawals" ADD CONSTRAINT "consent_withdrawals_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_nqr_code_qualifications_nqr_code_fk" FOREIGN KEY ("nqr_code") REFERENCES "public"."qualifications"("nqr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_checks" ADD CONSTRAINT "evidence_checks_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_reviews" ADD CONSTRAINT "flag_reviews_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_reviews" ADD CONSTRAINT "flag_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_results" ADD CONSTRAINT "mapping_results_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nos" ADD CONSTRAINT "nos_nqr_code_qualifications_nqr_code_fk" FOREIGN KEY ("nqr_code") REFERENCES "public"."qualifications"("nqr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescore_tasks" ADD CONSTRAINT "rescore_tasks_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescore_tasks" ADD CONSTRAINT "rescore_tasks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescores" ADD CONSTRAINT "rescores_task_id_rescore_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."rescore_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescores" ADD CONSTRAINT "rescores_master_id_users_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_decisions" ADD CONSTRAINT "route_decisions_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_decisions" ADD CONSTRAINT "route_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entries_session" ON "audit_entries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "evidence_sha256" ON "evidence" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "evidence_session" ON "evidence" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "flags_session" ON "flags" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scores_session" ON "scores" USING btree ("session_id");