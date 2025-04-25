import { db } from "../db";
import { campaigns } from "@shared/schema";
import { log } from "../vite";
import { pgTable, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Migration to add daily spent tracking fields to the campaigns table
 * These fields are used to track daily spending for TrafficStar campaigns
 * and implement the $10 daily budget threshold for auto-management
 */
export async function addDailySpentFields(): Promise<boolean> {
  try {
    log("Starting daily spent fields migration...");
    
    // Check if the daily_spent column already exists
    const existingColumns = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'daily_spent'
    `);
    
    if (existingColumns.rowCount && existingColumns.rowCount > 0) {
      log("daily_spent column already exists, skipping migration");
      return true;
    }
    
    // Add daily_spent, daily_spent_date, and last_spent_check columns
    await db.execute(sql`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS daily_spent DECIMAL(10, 4) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_spent_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS last_spent_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    log("✅ Successfully added daily spent fields to campaigns table");
    return true;
  } catch (error) {
    log(`❌ Error adding daily spent fields: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Check if the migration is needed
 */
export async function isDailySpentFieldsMigrationNeeded(): Promise<boolean> {
  try {
    const existingColumns = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'campaigns' AND column_name = 'daily_spent'
    `);
    
    return !(existingColumns.rowCount && existingColumns.rowCount > 0);
  } catch (error) {
    log(`Error checking if daily spent fields migration is needed: ${error}`);
    return true; // Assume migration is needed if check fails
  }
}