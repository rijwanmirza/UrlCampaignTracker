/**
 * Migration script to update the campaign multiplier column to decimal type
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function updateMultiplierToDecimal() {
  try {
    console.log("Starting migration: Converting campaign multiplier to decimal type...");
    
    // First check if the column is already NUMERIC
    const checkResult = await db.execute(sql`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'multiplier'
    `);
    
    if (checkResult.rows.length > 0 && checkResult.rows[0].data_type === 'numeric') {
      console.log("Migration not needed: multiplier is already numeric type");
      return { success: true, message: "Column already has correct type" };
    }
    
    // Alter the column type from INTEGER to NUMERIC
    await db.execute(sql`
      ALTER TABLE campaigns 
      ALTER COLUMN multiplier TYPE NUMERIC(10,2) USING multiplier::NUMERIC;
    `);
    
    console.log("Migration complete: Campaign multiplier column converted to decimal type");
    return { success: true, message: "Column type updated successfully" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, message: `Migration failed: ${error}` };
  }
}