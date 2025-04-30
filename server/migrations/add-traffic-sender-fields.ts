/**
 * Migration script to add Traffic Sender fields to the campaigns table
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function addTrafficSenderFields() {
  try {
    console.log("Starting migration: Adding Traffic Sender fields to campaigns table...");
    
    // Check if the traffic_sender_enabled column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_sender_enabled'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log("Migration not needed: traffic_sender_enabled column already exists");
      return { success: true, message: "Columns already exist" };
    }
    
    // Add the Traffic Sender columns
    await db.execute(sql`
      ALTER TABLE campaigns 
      ADD COLUMN traffic_sender_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN last_traffic_sender_action TIMESTAMP,
      ADD COLUMN last_traffic_sender_status TEXT;
    `);
    
    console.log("Migration complete: Traffic Sender fields added to campaigns table");
    return { success: true, message: "Columns added successfully" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, message: `Migration failed: ${error}` };
  }
}