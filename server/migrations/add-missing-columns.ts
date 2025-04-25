import { db } from "../db";
import { sql } from "drizzle-orm";
import { log } from "../vite";

/**
 * Migration to add all missing columns to ensure compatibility
 * This is a "safe" migration that will add any missing columns to both tables
 */
export async function addMissingColumns(): Promise<boolean> {
  try {
    log("Starting comprehensive column migration...");
    
    // Add missing columns to campaigns table
    await db.execute(sql`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS daily_spent DECIMAL(10, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_spent_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS last_spent_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    // Add missing columns to trafficstar_campaigns table
    await db.execute(sql`
      ALTER TABLE trafficstar_campaigns
      ADD COLUMN IF NOT EXISTS daily_spent DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_spent_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    log("✅ Successfully added all missing columns to tables");
    return true;
  } catch (error) {
    log(`❌ Error adding missing columns: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}