import { pgTable, text, serial, integer, timestamp, pgEnum, numeric, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Redirect method enum
export const RedirectMethod = {
  DIRECT: "direct",
  META_REFRESH: "meta_refresh",
  DOUBLE_META_REFRESH: "double_meta_refresh",
  HTTP_307: "http_307",
  HTTP2_307_TEMPORARY: "http2_307_temporary",
  HTTP2_FORCED_307: "http2_forced_307",
} as const;

export type RedirectMethodType = typeof RedirectMethod[keyof typeof RedirectMethod];

// URL status enum
export const urlStatusEnum = pgEnum('url_status', [
  'active',    // URL is active and receiving traffic
  'paused',    // URL is paused by user
  'completed', // URL has reached its click limit
  'deleted',   // URL is soft-deleted
  'rejected'   // URL was rejected due to duplicate name
]);

// Campaign schema
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  redirectMethod: text("redirect_method").default(RedirectMethod.DIRECT).notNull(),
  customPath: text("custom_path").unique(), // Custom path for campaign URLs
  multiplier: numeric("multiplier", { precision: 10, scale: 2 }).default("1").notNull(), // Multiplier for URL click limits (supports decimals)
  pricePerThousand: numeric("price_per_thousand", { precision: 10, scale: 4 }).default("0").notNull(), // Price per 1000 clicks in dollars (supports 4 decimal places)
  trafficstarCampaignId: text("trafficstar_campaign_id"), // Link to TrafficStar campaign ID
  autoManageTrafficstar: boolean("auto_manage_trafficstar").default(false), // Auto-manage TrafficStar campaign
  lastTrafficstarSync: timestamp("last_trafficstar_sync"), // Last time TS campaign was synced
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  redirectMethod: z.enum([
    RedirectMethod.DIRECT,
    RedirectMethod.META_REFRESH,
    RedirectMethod.DOUBLE_META_REFRESH,
    RedirectMethod.HTTP_307,
    RedirectMethod.HTTP2_307_TEMPORARY,
    RedirectMethod.HTTP2_FORCED_307
  ]).default(RedirectMethod.DIRECT),
  customPath: z.string().optional(),
  multiplier: z.number().min(0.01).default(1),
  pricePerThousand: z.number().min(0).max(10000).default(0),
  // TrafficStar fields
  trafficstarCampaignId: z.string().optional(),
  autoManageTrafficstar: z.boolean().default(false).optional(),
  lastTrafficstarSync: z.date().optional().nullable(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  redirectMethod: z.enum([
    RedirectMethod.DIRECT,
    RedirectMethod.META_REFRESH,
    RedirectMethod.DOUBLE_META_REFRESH,
    RedirectMethod.HTTP_307,
    RedirectMethod.HTTP2_307_TEMPORARY,
    RedirectMethod.HTTP2_FORCED_307
  ]).optional(),
  customPath: z.string().optional(),
  multiplier: z.number().min(0.01).optional(),
  pricePerThousand: z.number().min(0).max(10000).optional(),
  // TrafficStar fields
  trafficstarCampaignId: z.string().optional(),
  autoManageTrafficstar: z.boolean().optional(),
  lastTrafficstarSync: z.date().optional().nullable(),
});

// URL schema
export const urls = pgTable("urls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"), // Can be null if not linked to a campaign
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  clickLimit: integer("click_limit").notNull(),
  originalClickLimit: integer("original_click_limit").default(0).notNull(), // The original click limit entered by user
  clicks: integer("clicks").default(0).notNull(),
  status: text("status").default('active').notNull(), // Using text for now as pgEnum causes issues with drizzle-kit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUrlSchema = createInsertSchema(urls).omit({
  id: true,
  clicks: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  clickLimit: z.number().int().min(1),
  originalClickLimit: z.number().int().min(1), // Allow explicitly setting the original click limit
});

export const updateUrlSchema = createInsertSchema(urls).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  campaignId: z.number().int().optional(),
  name: z.string().optional(),
  targetUrl: z.string().url().optional(),
  clickLimit: z.number().int().min(1).optional(),
  originalClickLimit: z.number().int().min(1).optional(),
  clicks: z.number().int().min(0).optional(),
  status: z.enum(['active', 'paused', 'completed', 'deleted', 'rejected']).optional(),
});

// Schema for bulk actions
export const bulkUrlActionSchema = z.object({
  urlIds: z.array(z.number()),
  action: z.enum(['pause', 'activate', 'delete', 'permanent_delete'])
});

// Types
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;

export type Url = typeof urls.$inferSelect;
export type InsertUrl = z.infer<typeof insertUrlSchema>;
export type UpdateUrl = z.infer<typeof updateUrlSchema>;
export type BulkUrlAction = z.infer<typeof bulkUrlActionSchema>;

// Extended schemas with campaign relationship
export type UrlWithActiveStatus = Url & {
  isActive: boolean;
};

export type CampaignWithUrls = Campaign & {
  urls: UrlWithActiveStatus[];
};

// TrafficStar API schema
export const trafficstarCredentials = pgTable("trafficstar_credentials", {
  id: serial("id").primaryKey(),
  apiKey: text("api_key").notNull(),
  accessToken: text("access_token"),
  tokenExpiry: timestamp("token_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const trafficstarCampaigns = pgTable("trafficstar_campaigns", {
  id: serial("id").primaryKey(),
  trafficstarId: text("trafficstar_id").notNull().unique(), // Store as text for compatibility
  name: text("name").notNull(),
  status: text("status").notNull(),
  active: boolean("active").default(true),
  isArchived: boolean("is_archived").default(false),
  maxDaily: numeric("max_daily", { precision: 10, scale: 2 }), // Budget
  pricingModel: text("pricing_model"),
  scheduleEndTime: text("schedule_end_time"),
  lastRequestedAction: text("last_requested_action"), // 'activate' or 'pause' - what we last asked the API to do
  lastRequestedActionAt: timestamp("last_requested_action_at"), // When we last sent a request
  lastRequestedActionSuccess: boolean("last_requested_action_success"), // Whether API reported success
  lastVerifiedStatus: text("last_verified_status"), // Last status we verified directly from the API
  syncStatus: text("sync_status").default('synced'), // 'synced', 'pending_activation', 'pending_pause'
  
  // New tracking fields for immediate updates
  lastBudgetUpdate: timestamp("last_budget_update"), // When budget was last updated
  lastBudgetUpdateValue: numeric("last_budget_update_value", { precision: 10, scale: 2 }), // The value set
  lastEndTimeUpdate: timestamp("last_end_time_update"), // When end time was last updated
  lastEndTimeUpdateValue: text("last_end_time_update_value"), // The value set
  
  campaignData: json("campaign_data"), // Store full campaign data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTrafficstarCredentialSchema = createInsertSchema(trafficstarCredentials).omit({
  id: true,
  accessToken: true,
  tokenExpiry: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTrafficstarCredentialSchema = createInsertSchema(trafficstarCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const trafficstarCampaignActionSchema = z.object({
  campaignId: z.number(),
  action: z.enum(['pause', 'activate', 'archive']),
});

export const trafficstarCampaignBudgetSchema = z.object({
  campaignId: z.number(),
  maxDaily: z.number().min(0),
});

export const trafficstarCampaignEndTimeSchema = z.object({
  campaignId: z.number(),
  scheduleEndTime: z.string(),
});

// Types
export type TrafficstarCredential = typeof trafficstarCredentials.$inferSelect;
export type InsertTrafficstarCredential = z.infer<typeof insertTrafficstarCredentialSchema>;
export type UpdateTrafficstarCredential = z.infer<typeof updateTrafficstarCredentialSchema>;

export type TrafficstarCampaign = typeof trafficstarCampaigns.$inferSelect;
export type TrafficstarCampaignAction = z.infer<typeof trafficstarCampaignActionSchema>;
export type TrafficstarCampaignBudget = z.infer<typeof trafficstarCampaignBudgetSchema>;
export type TrafficstarCampaignEndTime = z.infer<typeof trafficstarCampaignEndTimeSchema>;
