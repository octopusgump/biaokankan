CREATE TABLE `managed_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`entry` text NOT NULL,
	`list_entry` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '河南省' NOT NULL,
	`type` text DEFAULT '公共资源交易中心' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`adapter` text,
	`status` text DEFAULT '候选' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`last_scan` text,
	`result` text DEFAULT '候选' NOT NULL,
	`found` integer DEFAULT 0 NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`projects_json` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_managed_sources_entry` ON `managed_sources` (`entry`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_managed_sources_name_entry` ON `managed_sources` (`name`,`entry`);