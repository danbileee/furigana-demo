CREATE TABLE `furiganas` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_text` text NOT NULL,
	`raw_text_snippet` text NOT NULL,
	`annotation_string` text NOT NULL,
	`title` text,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_furiganas_active_cursor` ON `furiganas` (`created_at`,`id`) WHERE "furiganas"."deleted_at" IS NULL;