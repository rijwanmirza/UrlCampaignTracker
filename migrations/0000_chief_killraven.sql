CREATE TYPE "public"."url_status" AS ENUM('active', 'paused', 'completed', 'deleted', 'rejected');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_method" text DEFAULT 'direct' NOT NULL,
	"custom_path" text,
	"multiplier" numeric(10, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_custom_path_unique" UNIQUE("custom_path")
);
--> statement-breakpoint
CREATE TABLE "trafficstar_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"trafficstar_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"active" boolean DEFAULT true,
	"is_archived" boolean DEFAULT false,
	"max_daily" numeric(10, 2),
	"pricing_model" text,
	"schedule_end_time" text,
	"campaign_data" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trafficstar_campaigns_trafficstar_id_unique" UNIQUE("trafficstar_id")
);
--> statement-breakpoint
CREATE TABLE "trafficstar_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"access_token" text,
	"token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"name" text NOT NULL,
	"target_url" text NOT NULL,
	"click_limit" integer NOT NULL,
	"original_click_limit" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
