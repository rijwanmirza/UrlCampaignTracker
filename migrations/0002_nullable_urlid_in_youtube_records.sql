ALTER TYPE "public"."url_status" ADD VALUE 'direct_rejected';--> statement-breakpoint
CREATE TABLE "youtube_url_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"url_id" integer,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"target_url" text NOT NULL,
	"youtube_video_id" text NOT NULL,
	"deletion_reason" text NOT NULL,
	"country_restricted" boolean DEFAULT false,
	"private_video" boolean DEFAULT false,
	"deleted_video" boolean DEFAULT false,
	"age_restricted" boolean DEFAULT false,
	"made_for_kids" boolean DEFAULT false,
	"exceeded_duration" boolean DEFAULT false,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_api_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_api_interval_minutes" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_api_last_check" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_country_restriction" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_private" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_deleted" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_age_restricted" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_made_for_kids" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_check_duration" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "youtube_max_duration_minutes" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "youtube_url_records" ADD CONSTRAINT "youtube_url_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;