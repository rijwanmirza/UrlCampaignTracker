/**
 * Click Analytics Migration
 * 
 * This script creates the click_analytics table and required indexes
 */

import { db } from "../server/db.ts";
import { sql } from "drizzle-orm";

/**
 * Create the click_analytics table and indexes
 */
async function createClickAnalyticsTable() {
  console.log("Creating click_analytics table...");

  // Create the table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS click_analytics (
      id SERIAL PRIMARY KEY,
      url_id INTEGER NOT NULL,
      campaign_id INTEGER,
      click_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      click_hour INTEGER NOT NULL,
      click_date DATE DEFAULT CURRENT_DATE NOT NULL,
      timezone TEXT DEFAULT 'UTC' NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      referrer TEXT,
      country TEXT,
      city TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `);

  // Create indexes for better query performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_click_analytics_url_id ON click_analytics(url_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_click_analytics_campaign_id ON click_analytics(campaign_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_click_analytics_click_time ON click_analytics(click_time)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_click_analytics_click_date ON click_analytics(click_date)
  `);

  console.log("✅ Click analytics table created successfully");
}

// Execute the migration
createClickAnalyticsTable()
  .then(() => {
    console.log("Click analytics migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error in click analytics migration:", error);
    process.exit(1);
  });