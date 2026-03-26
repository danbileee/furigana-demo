CREATE TABLE `__new_furiganas` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`raw_text` text NOT NULL,
	`raw_text_snippet` text NOT NULL,
	`annotation_string` text NOT NULL,
	`title` text,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_furiganas` (
	`id`,
	`created_at`,
	`updated_at`,
	`raw_text`,
	`raw_text_snippet`,
	`annotation_string`,
	`title`,
	`deleted_at`
)
SELECT
	`id`,
	`created_at`,
	`created_at`,
	`raw_text`,
	`raw_text_snippet`,
	`annotation_string`,
	`title`,
	`deleted_at`
FROM `furiganas`;
--> statement-breakpoint
DROP TABLE `furiganas`;
--> statement-breakpoint
ALTER TABLE `__new_furiganas` RENAME TO `furiganas`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_furiganas_active_cursor` ON `furiganas` ("created_at" desc,"id" desc) WHERE "furiganas"."deleted_at" IS NULL;