import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Campaign schema
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
});

// URL schema
export const urls = pgTable("urls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  clickLimit: integer("click_limit").notNull(),
  clicks: integer("clicks").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUrlSchema = createInsertSchema(urls).omit({
  id: true,
  clicks: true,
  createdAt: true,
});

export const updateUrlSchema = createInsertSchema(urls).omit({
  id: true,
  createdAt: true,
});

// Types
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Url = typeof urls.$inferSelect;
export type InsertUrl = z.infer<typeof insertUrlSchema>;
export type UpdateUrl = z.infer<typeof updateUrlSchema>;

// Extended schemas with campaign relationship
export type UrlWithActiveStatus = Url & {
  isActive: boolean;
};

export type CampaignWithUrls = Campaign & {
  urls: UrlWithActiveStatus[];
};
