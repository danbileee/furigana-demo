DROP INDEX `idx_furiganas_active_cursor`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_furiganas_active_cursor` ON `furiganas` ("created_at" desc,"id" desc) WHERE "furiganas"."deleted_at" IS NULL;