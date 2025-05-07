CREATE TABLE "campaign_click_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"url_id" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_redirect_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"url_id" integer,
	"redirect_time" timestamp DEFAULT now() NOT NULL,
	"indian_time" text NOT NULL,
	"date_key" text NOT NULL,
	"hour_key" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "original_url_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target_url" text NOT NULL,
	"original_click_limit" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "original_url_records_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "url_click_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"url_id" integer NOT NULL,
	"log_entry" text NOT NULL,
	"click_time" timestamp DEFAULT now() NOT NULL,
	"indian_time" text NOT NULL,
	"date_key" text NOT NULL,
	"hour_key" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "url_click_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"url_id" integer NOT NULL,
	"click_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "price_per_thousand" numeric(10, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "trafficstar_campaign_id" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "auto_manage_trafficstar" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "budget_update_time" text DEFAULT '00:00:00';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_trafficstar_sync" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "daily_spent" numeric(10, 4) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "daily_spent_date" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_spent_check" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "traffic_generator_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "post_pause_check_minutes" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "high_spend_wait_minutes" integer DEFAULT 11;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "traffic_sender_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_traffic_sender_action" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_traffic_sender_status" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "last_budget_update_time" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "high_spend_budget_calc_time" timestamp;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_requested_action" text;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_requested_action_at" timestamp;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_requested_action_success" boolean;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_verified_status" text;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "sync_status" text DEFAULT 'synced';--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_budget_update" timestamp;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_budget_update_value" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_end_time_update" timestamp;--> statement-breakpoint
ALTER TABLE "trafficstar_campaigns" ADD COLUMN "last_end_time_update_value" text;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "pending_budget_update" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "budget_calculated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "campaign_click_records" ADD CONSTRAINT "campaign_click_records_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_click_records" ADD CONSTRAINT "campaign_click_records_url_id_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."urls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_redirect_logs" ADD CONSTRAINT "campaign_redirect_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_redirect_logs" ADD CONSTRAINT "campaign_redirect_logs_url_id_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."urls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_click_logs" ADD CONSTRAINT "url_click_logs_url_id_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."urls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_click_records" ADD CONSTRAINT "url_click_records_url_id_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."urls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "urls" ADD CONSTRAINT "urls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;