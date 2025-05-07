import { pgTable, text, serial, integer, timestamp, pgEnum, numeric, json, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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
  'active',         // URL is active and receiving traffic
  'paused',         // URL is paused by user
  'completed',      // URL has reached its click limit
  'deleted',        // URL is soft-deleted
  'rejected',       // URL was rejected due to duplicate name
  'direct_rejected' // URL was rejected immediately due to YouTube API validation
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
  autoManageTrafficstar: boolean("auto_manage_trafficstar").default(false), // DEPRECATED: Auto-manage functionality has been removed
  budgetUpdateTime: text("budget_update_time").default("00:00:00"), // Daily budget update time in UTC (HH:MM:SS format)
  lastTrafficstarSync: timestamp("last_trafficstar_sync"), // Last time TS campaign was synced
  // TrafficStar spent tracking fields
  dailySpent: numeric("daily_spent", { precision: 10, scale: 4 }).default("0"), // Daily spent value from TrafficStar
  dailySpentDate: timestamp("daily_spent_date", { mode: 'date' }).defaultNow(), // Date of the daily spent value (date only)
  lastSpentCheck: timestamp("last_spent_check").defaultNow(), // Last time spent was checked
  // Traffic Generator feature
  trafficGeneratorEnabled: boolean("traffic_generator_enabled").default(false), // Enable/disable traffic generator
  postPauseCheckMinutes: integer("post_pause_check_minutes").default(2), // Minutes to wait after pause before checking spent value
  highSpendWaitMinutes: integer("high_spend_wait_minutes").default(11), // Minutes to wait after pause for high-spend campaigns ($10+)
  // DEPRECATED: Traffic Sender feature has been removed
  // Keeping these fields in the schema for backward compatibility but they are no longer used
  trafficSenderEnabled: boolean("traffic_sender_enabled").default(false), // DEPRECATED: Traffic Sender removed
  lastTrafficSenderAction: timestamp("last_traffic_sender_action"), // DEPRECATED: Traffic Sender removed
  lastTrafficSenderStatus: text("last_traffic_sender_status"), // DEPRECATED: Traffic Sender removed
  lastBudgetUpdateTime: timestamp("last_budget_update_time"), // Last time the budget was updated for new URLs
  // Track when high-spend budget calculation was performed ($10+ handling)
  highSpendBudgetCalcTime: timestamp("high_spend_budget_calc_time"),
  // YouTube API integration fields
  youtubeApiEnabled: boolean("youtube_api_enabled").default(false), // Enable/disable YouTube URL checking
  youtubeApiIntervalMinutes: integer("youtube_api_interval_minutes").default(60), // Minutes between YouTube API checks (default: 60 mins)
  youtubeApiLastCheck: timestamp("youtube_api_last_check"), // Last time YouTube API check was run
  // YouTube deletion flags - which conditions to check
  youtubeCheckCountryRestriction: boolean("youtube_check_country_restriction").default(true), // Check if video is restricted in India
  youtubeCheckPrivate: boolean("youtube_check_private").default(true), // Check if video is private
  youtubeCheckDeleted: boolean("youtube_check_deleted").default(true), // Check if video is deleted
  youtubeCheckAgeRestricted: boolean("youtube_check_age_restricted").default(true), // Check if video is age restricted
  youtubeCheckMadeForKids: boolean("youtube_check_made_for_kids").default(true), // Check if video is made for kids
  youtubeCheckDuration: boolean("youtube_check_duration").default(false), // Check if video duration exceeds max limit
  youtubeMaxDurationMinutes: integer("youtube_max_duration_minutes").default(30), // Maximum video duration in minutes
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
  // DEPRECATED: Auto-management functionality has been completely removed from the system
  autoManageTrafficstar: z.boolean().default(false).optional(), // DEPRECATED
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
  // DEPRECATED: Auto-management functionality has been completely removed from the system
  autoManageTrafficstar: z.boolean().optional(), // DEPRECATED
  budgetUpdateTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, "Invalid time format. Use HH:MM:SS").optional(),
  lastTrafficstarSync: z.date().optional().nullable(),
  // Traffic Generator feature
  trafficGeneratorEnabled: z.boolean().optional(), // Traffic generator toggle
  postPauseCheckMinutes: z.number().int().min(1).max(30).optional(), // Minutes to wait after pause before checking spent value (1-30)
  highSpendWaitMinutes: z.number().int().min(1).max(30).optional(), // Minutes to wait after pause for high-spend campaigns ($10+)
  // DEPRECATED: Traffic Sender fields - no longer in use
  trafficSenderEnabled: z.boolean().optional(), // DEPRECATED
  lastTrafficSenderAction: z.date().optional().nullable(), // DEPRECATED
  lastTrafficSenderStatus: z.string().optional(), // DEPRECATED
  lastBudgetUpdateTime: z.date().optional().nullable(),
  // YouTube API integration fields
  youtubeApiEnabled: z.boolean().optional(),
  youtubeApiIntervalMinutes: z.number().int().min(1).max(1440).optional(), // 1 min to 24 hours
  youtubeApiLastCheck: z.date().optional().nullable(),
  // YouTube check conditions
  youtubeCheckCountryRestriction: z.boolean().optional(),
  youtubeCheckPrivate: z.boolean().optional(),
  youtubeCheckDeleted: z.boolean().optional(),
  youtubeCheckAgeRestricted: z.boolean().optional(),
  youtubeCheckMadeForKids: z.boolean().optional(),
  youtubeCheckDuration: z.boolean().optional(),
  youtubeMaxDurationMinutes: z.number().int().min(1).max(180).optional(), // 1 min to 3 hours
});

// URL schema
export const urls = pgTable("urls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id), // Can be null if not linked to a campaign
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  clickLimit: integer("click_limit").notNull(),
  originalClickLimit: integer("original_click_limit").default(0).notNull(), // The original click limit entered by user
  clicks: integer("clicks").default(0).notNull(),
  status: text("status").default('active').notNull(), // Using text for now as pgEnum causes issues with drizzle-kit
  // URL Budget fields for newly added URLs after high spend detection
  pendingBudgetUpdate: boolean("pending_budget_update").default(false), // True if URL is waiting for budget update
  budgetCalculated: boolean("budget_calculated").default(false), // True if budget has been calculated for this URL
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
  // No upper limit on click limit values - any positive integer is allowed
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
  status: z.enum(['active', 'paused', 'completed', 'deleted', 'rejected', 'direct_rejected']).optional(),
  // URL budget tracking fields
  pendingBudgetUpdate: z.boolean().optional(),
  budgetCalculated: z.boolean().optional(),
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
  // Make sure these TrafficStar spent fields are included
  dailySpent?: string | number;
  dailySpentDate?: string | Date;
  lastSpentCheck?: string | Date;
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

// DEPRECATED: Traffic Sender feature schema
// This schema is no longer used as the Traffic Sender feature has been removed
export const trafficSenderActionSchema = z.object({
  campaignId: z.number(),
  enabled: z.boolean(),
});

// Original URL Records schema
export const originalUrlRecords = pgTable("original_url_records", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // Unique name for reference
  targetUrl: text("target_url").notNull(),
  originalClickLimit: integer("original_click_limit").notNull(), // Master value for click limit
  status: text("status").default('active').notNull(), // Status: active, paused, completed, deleted, rejected, direct_rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOriginalUrlRecordSchema = createInsertSchema(originalUrlRecords).omit({
  id: true,
  createdAt: true, 
  updatedAt: true,
}).extend({
  status: z.enum(['active', 'paused', 'completed', 'deleted', 'rejected', 'direct_rejected']).optional(),
});

export const updateOriginalUrlRecordSchema = createInsertSchema(originalUrlRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().optional(),
  targetUrl: z.string().url().optional(),
  originalClickLimit: z.number().int().min(1).optional(),
  status: z.enum(['active', 'paused', 'completed', 'deleted', 'rejected', 'direct_rejected']).optional(),
});

// Types
export type TrafficstarCredential = typeof trafficstarCredentials.$inferSelect;
export type InsertTrafficstarCredential = z.infer<typeof insertTrafficstarCredentialSchema>;
export type UpdateTrafficstarCredential = z.infer<typeof updateTrafficstarCredentialSchema>;

export type TrafficstarCampaign = typeof trafficstarCampaigns.$inferSelect;
export type TrafficstarCampaignAction = z.infer<typeof trafficstarCampaignActionSchema>;
export type TrafficstarCampaignBudget = z.infer<typeof trafficstarCampaignBudgetSchema>;
export type TrafficstarCampaignEndTime = z.infer<typeof trafficstarCampaignEndTimeSchema>;

export type OriginalUrlRecord = typeof originalUrlRecords.$inferSelect;
export type InsertOriginalUrlRecord = z.infer<typeof insertOriginalUrlRecordSchema>;
export type UpdateOriginalUrlRecord = z.infer<typeof updateOriginalUrlRecordSchema>;

// Campaign Click Records Schema - Tracking all redirects for campaigns
export const campaignClickRecords = pgTable("campaign_click_records", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  urlId: integer("url_id").references(() => urls.id), // Optional, as some clicks might be directly from campaign
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  // Removed IP address, user agent, and referer fields as they're not needed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignClickRecordSchema = createInsertSchema(campaignClickRecords).omit({
  id: true,
  createdAt: true,
});

// Types for Campaign Click Records
export type CampaignClickRecord = typeof campaignClickRecords.$inferSelect;
export type InsertCampaignClickRecord = z.infer<typeof insertCampaignClickRecordSchema>;

// Campaign Redirect Logs Schema - For detailed tracking of each redirect with timestamps
export const campaignRedirectLogs = pgTable("campaign_redirect_logs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  urlId: integer("url_id").references(() => urls.id), // Optional, for direct campaign redirects
  redirectTime: timestamp("redirect_time").defaultNow().notNull(),
  indianTime: text("indian_time").notNull(), // Format: "YYYY-MM-DD HH:MM:SS"
  dateKey: text("date_key").notNull(), // Format: "YYYY-MM-DD" for faster filtering
  hourKey: integer("hour_key").notNull(), // 0-23 for hour-based filtering
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignRedirectLogSchema = createInsertSchema(campaignRedirectLogs).omit({
  id: true,
  createdAt: true,
});

// Types for Campaign Redirect Logs
export type CampaignRedirectLog = typeof campaignRedirectLogs.$inferSelect;
export type InsertCampaignRedirectLog = z.infer<typeof insertCampaignRedirectLogSchema>;

// Analytics filter schemas
export const timeRangeFilterSchema = z.object({
  filterType: z.enum([
    'total', 'today', 'yesterday', 
    'last_2_days', 'last_3_days', 'last_4_days', 
    'last_5_days', 'last_6_days', 'last_7_days',
    'last_30_days', // Added to match the UI options
    'this_month', 'last_month', 'last_6_months',
    'this_year', 'last_year', 'custom_range',
    'all', 'all_time' // Both variants for backward compatibility
  ]),
  startDate: z.string().optional(), // Required for custom range
  endDate: z.string().optional(),   // Required for custom range
  timezone: z.string().default("UTC"),
  showHourly: z.boolean().default(false),
});

export type TimeRangeFilter = z.infer<typeof timeRangeFilterSchema>;

// URL Click Records Schema - Tracking all clicks for URLs (no personal data)
export const urlClickRecords = pgTable("url_click_records", {
  id: serial("id").primaryKey(),
  urlId: integer("url_id").notNull().references(() => urls.id),
  clickTime: timestamp("click_time").defaultNow().notNull(),
  // Note: This table contains ip_address, user_agent, and referer fields in the database,
  // but we intentionally don't include them in our schema to avoid tracking personal data
});

// Use z.object directly to define our insert schema with only the fields we want
export const insertUrlClickRecordSchema = z.object({
  urlId: z.number().int().positive(),
  clickTime: z.date().optional(), // Optional as it defaults to now()
});

// Types for URL Click Records
export type UrlClickRecord = typeof urlClickRecords.$inferSelect;
export type InsertUrlClickRecord = z.infer<typeof insertUrlClickRecordSchema>;

// URL Click Logs Schema - For detailed tracking of each URL click with timestamps
export const urlClickLogs = pgTable("url_click_logs", {
  id: serial("id").primaryKey(),
  urlId: integer("url_id").notNull().references(() => urls.id),
  logEntry: text("log_entry").notNull(), // The actual log entry text
  clickTime: timestamp("click_time").defaultNow().notNull(),
  indianTime: text("indian_time").notNull(), // Format: "DD-Month-YYYY:HH:MM:SS"
  dateKey: text("date_key").notNull(), // Format: "YYYY-MM-DD" for faster filtering
  hourKey: integer("hour_key").notNull(), // 0-23 for hour-based filtering
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUrlClickLogSchema = createInsertSchema(urlClickLogs).omit({
  id: true,
  createdAt: true,
});

// Types for URL Click Logs
export type UrlClickLog = typeof urlClickLogs.$inferSelect;
export type InsertUrlClickLog = z.infer<typeof insertUrlClickLogSchema>;

// Define relationships between tables
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  urls: many(urls),
  campaignClickRecords: many(campaignClickRecords),
  campaignRedirectLogs: many(campaignRedirectLogs),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [urls.campaignId],
    references: [campaigns.id],
  }),
  urlClickRecords: many(urlClickRecords),
  urlClickLogs: many(urlClickLogs),
}));

export const urlClickRecordsRelations = relations(urlClickRecords, ({ one }) => ({
  url: one(urls, {
    fields: [urlClickRecords.urlId],
    references: [urls.id],
  }),
}));

export const urlClickLogsRelations = relations(urlClickLogs, ({ one }) => ({
  url: one(urls, {
    fields: [urlClickLogs.urlId],
    references: [urls.id],
  }),
}));

export const campaignClickRecordsRelations = relations(campaignClickRecords, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignClickRecords.campaignId],
    references: [campaigns.id],
  }),
  url: one(urls, {
    fields: [campaignClickRecords.urlId],
    references: [urls.id],
  }),
}));

export const campaignRedirectLogsRelations = relations(campaignRedirectLogs, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignRedirectLogs.campaignId],
    references: [campaigns.id],
  }),
  url: one(urls, {
    fields: [campaignRedirectLogs.urlId],
    references: [urls.id],
  }),
}));

// YouTube URL Records schema - for tracking deleted URLs due to YouTube API checks
export const youtubeUrlRecords = pgTable("youtube_url_records", {
  id: serial("id").primaryKey(),
  urlId: integer("url_id").notNull(), // Original URL ID (may be deleted)
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  name: text("name").notNull(), // URL name
  targetUrl: text("target_url").notNull(), // Full URL
  youtubeVideoId: text("youtube_video_id").notNull(), // YouTube video ID extracted from URL
  deletionReason: text("deletion_reason").notNull(), // Reason for deletion
  // Detailed reason flags
  countryRestricted: boolean("country_restricted").default(false), // Video restricted in India
  privateVideo: boolean("private_video").default(false), // Private video
  deletedVideo: boolean("deleted_video").default(false), // Deleted/unavailable video
  ageRestricted: boolean("age_restricted").default(false), // Age restricted video
  madeForKids: boolean("made_for_kids").default(false), // Made for kids
  exceededDuration: boolean("exceeded_duration").default(false), // Video exceeds maximum duration
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertYoutubeUrlRecordSchema = createInsertSchema(youtubeUrlRecords).omit({
  id: true,
  createdAt: true,
});

// Types for YouTube URL Records
export type YoutubeUrlRecord = typeof youtubeUrlRecords.$inferSelect;
export type InsertYoutubeUrlRecord = z.infer<typeof insertYoutubeUrlRecordSchema>;

// Relations for YouTube URL Records
export const youtubeUrlRecordsRelations = relations(youtubeUrlRecords, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [youtubeUrlRecords.campaignId],
    references: [campaigns.id],
  }),
}));
