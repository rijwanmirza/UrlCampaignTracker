import { pgTable, text, serial, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Redirect method enum
export const RedirectMethod = {
  DIRECT: "direct",
  META_REFRESH: "meta_refresh",
  DOUBLE_META_REFRESH: "double_meta_refresh",
  HTTP_307: "http_307",
} as const;

export type RedirectMethodType = typeof RedirectMethod[keyof typeof RedirectMethod];

// URL status enum
export const urlStatusEnum = pgEnum('url_status', [
  'active',    // URL is active and receiving traffic
  'paused',    // URL is paused by user
  'completed', // URL has reached its click limit
  'deleted'    // URL is soft-deleted
]);

// Campaign schema
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  redirectMethod: text("redirect_method").default(RedirectMethod.DIRECT).notNull(),
  customPath: text("custom_path").unique(), // Custom path for campaign URLs
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
    RedirectMethod.HTTP_307
  ]).default(RedirectMethod.DIRECT),
  customPath: z.string().optional(),
});

export const updateCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true, 
  updatedAt: true,
}).extend({
  redirectMethod: z.enum([
    RedirectMethod.DIRECT,
    RedirectMethod.META_REFRESH,
    RedirectMethod.DOUBLE_META_REFRESH,
    RedirectMethod.HTTP_307
  ]).optional(),
  customPath: z.string().optional(),
});

// URL schema
export const urls = pgTable("urls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id"), // Can be null if not linked to a campaign
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  clickLimit: integer("click_limit").notNull(),
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
});

export const updateUrlSchema = createInsertSchema(urls).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(['active', 'paused', 'completed', 'deleted']).optional(),
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
