/**
 * Migration script to add TrafficStar-related fields to the campaigns table
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function addTrafficStarFields() {
  try {
    console.log("Starting migration: Adding TrafficStar fields to campaigns table...");
    
    // Check if the trafficstar_campaign_id column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'trafficstar_campaign_id'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log("Migration not needed: trafficstar_campaign_id column already exists");
      return { success: true, message: "Columns already exist" };
    }
    
    // Add the trafficstar_campaign_id column
    await db.execute(sql`
      ALTER TABLE campaigns 
      ADD COLUMN trafficstar_campaign_id TEXT,
      ADD COLUMN auto_manage_trafficstar BOOLEAN DEFAULT FALSE,
      ADD COLUMN last_trafficstar_sync TIMESTAMP;
    `);
    
    console.log("Migration complete: TrafficStar fields added to campaigns table");
    return { success: true, message: "Columns added successfully" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, message: `Migration failed: ${error}` };
  }
}