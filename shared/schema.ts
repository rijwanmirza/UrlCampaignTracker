import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, uniqueIndex, varchar, date, numeric } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Redirect methods enum
export const RedirectMethod = {
  META_REFRESH: "meta_refresh",
  DOUBLE_META_REFRESH: "double_meta_refresh",
  HTTP_307: "http_307",
  HTTP2_307_TEMPORARY: "http2_307_temporary",
  HTTP2_FORCED_307: "http2_forced_307",
  DIRECT: "direct"
} as const;

// Timezones for analytics
export const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney'
] as const;

// Campaigns table
export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  redirectMethod: text('redirect_method').notNull(),
  customPath: text('custom_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  trafficstarCampaignId: text('trafficstar_campaign_id'),
  budgetUpdateTime: text('budget_update_time').default('23:59:00'),
  multiplier: numeric('multiplier'),
  pricePerThousand: numeric('price_per_thousand'),
  dailySpent: numeric('daily_spent'),
  dailySpentDate: date('daily_spent_date'),
  lastSpentCheck: timestamp('last_spent_check'),
  lastTrafficstarSync: timestamp('last_trafficstar_sync'),
  autoManageTrafficstar: boolean('auto_manage_trafficstar'),
});

// Insert schema for campaigns
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ 
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTrafficstarSync: true,
  lastSpentCheck: true
});

// Select schema/type for campaigns
export const selectCampaignSchema = createSelectSchema(campaigns);
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

// URLs table
export const urls = pgTable('urls', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => campaigns.id),
  name: text('name').notNull(),
  targetUrl: text('target_url'),
  clicks: integer('clicks').default(0),
  clickLimit: integer('click_limit'),
  originalClickLimit: integer('original_click_limit'),
  status: text('status'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Insert schema for URLs
export const insertUrlSchema = createInsertSchema(urls).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

// Select schema/type for URLs
export const selectUrlSchema = createSelectSchema(urls);
export type Url = typeof urls.$inferSelect;
export type InsertUrl = z.infer<typeof insertUrlSchema>;

// Original URL Records table
export const originalUrlRecords = pgTable('original_url_records', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  targetUrl: text('target_url'),
  originalClickLimit: integer('original_click_limit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Insert schema for Original URL Records
export const insertOriginalUrlRecordSchema = createInsertSchema(originalUrlRecords).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

// Update schema for Original URL Records
export const updateOriginalUrlRecordSchema = createInsertSchema(originalUrlRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Select schema/type for Original URL Records
export const selectOriginalUrlRecordSchema = createSelectSchema(originalUrlRecords);
export type OriginalUrlRecord = typeof originalUrlRecords.$inferSelect;
export type InsertOriginalUrlRecord = z.infer<typeof insertOriginalUrlRecordSchema>;

// Analytics tables
export const clickAnalytics = pgTable('click_analytics', {
  id: serial('id').primaryKey(),
  urlId: integer('url_id').references(() => urls.id).notNull(),
  campaignId: integer('campaign_id').references(() => campaigns.id).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  referer: text('referer'),
  country: text('country'),
  city: text('city'),
  deviceType: text('device_type'),
  browser: text('browser'),
  operatingSystem: text('operating_system'),
});

// Analytics filter schema
export const analyticsFilterSchema = z.object({
  type: z.enum(['campaign', 'url']),
  id: z.number(),
  timeRange: z.enum([
    'today',
    'yesterday',
    'last_2_days',
    'last_3_days',
    'last_7_days',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'this_year',
    'last_year',
    'last_6_months',
    'all_time',
    'custom'
  ]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']),
  timezone: z.enum(timezones),
  page: z.number().default(1),
  pageSize: z.number().default(10),
});

// Type for analytics filter
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

// Type for analytics response
export type AnalyticsResponse = {
  summary: {
    totalClicks: number;
    resourceType: 'campaign' | 'url';
    resourceId: number;
    resourceName: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    timezone: string;
  };
  timeseries: {
    period: string;
    clicks: number;
  }[];
};

// TrafficStar credentials table
export const trafficstarCredentials = pgTable('trafficstar_credentials', {
  id: serial('id').primaryKey(),
  apiKey: text('api_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});