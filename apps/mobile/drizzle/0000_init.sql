CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`notice_version` text NOT NULL,
	`language` text NOT NULL,
	`read_aloud` integer NOT NULL,
	`event_id` text NOT NULL,
	`given_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `declarations` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text NOT NULL,
	`language` text NOT NULL,
	`source` text NOT NULL,
	`asr_transcript` text NOT NULL,
	`transcript` text NOT NULL,
	`event_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `device` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mapping_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`declaration_id` text NOT NULL,
	`pack_version` text NOT NULL,
	`suggested_nqr_code` text,
	`suggested_route` text NOT NULL,
	`needs_review` integer NOT NULL,
	`results` text NOT NULL,
	`suggested_at` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`declaration_id`) REFERENCES `declarations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`hash` text NOT NULL,
	`event` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_seq_unique` ON `outbox` (`seq`);--> statement-breakpoint
CREATE TABLE `outbox_acks` (
	`event_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`acked_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`language` text NOT NULL,
	`event_id` text NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `outbox`(`id`) ON UPDATE no action ON DELETE no action
);
