import { pgTable, text, integer, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// TrafficStar API credentials
export const trafficstarCredentials = pgTable('trafficstar_credentials', {
  id: integer('id').primaryKey().notNull(),
  apiKey: text('api_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// TrafficStar campaigns table for caching API responses
export const trafficstarCampaigns = pgTable('trafficstar_campaigns', {
  id: integer('id').primaryKey().notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  active: boolean('active').notNull(),
  isArchived: boolean('is_archived').notNull(),
  maxDaily: integer('max_daily').notNull(),
  pricingModel: text('pricing_model'),
  scheduleEndTime: text('schedule_end_time'),
  lastSynced: timestamp('last_synced').defaultNow().notNull()
});

// Zod schema for trafficstarCredentials
export const insertTrafficstarCredentialsSchema = createInsertSchema(trafficstarCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Zod schema for trafficstarCampaigns
export const insertTrafficstarCampaignSchema = createInsertSchema(trafficstarCampaigns).omit({
  lastSynced: true
});

// Type definitions
export type TrafficstarCredentials = typeof trafficstarCredentials.$inferSelect;
export type InsertTrafficstarCredentials = z.infer<typeof insertTrafficstarCredentialsSchema>;

export type TrafficstarCampaign = typeof trafficstarCampaigns.$inferSelect;
export type InsertTrafficstarCampaign = z.infer<typeof insertTrafficstarCampaignSchema>;