import { db } from "../db";
import { campaigns } from "@shared/schema";

/**
 * Migration script to add budgetUpdateTime field to campaigns table
 * This field stores the UTC time for when budget updates to $10.15 should occur
 */
export async function addBudgetUpdateTimeField() {
  try {
    console.log("Running migration to add budgetUpdateTime field...");
    
    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
      AND column_name = 'budget_update_time'
    `;
    
    const result = await db.execute(checkQuery);
    
    if (result.rowCount === 0) {
      // Column doesn't exist, add it
      console.log("Adding budget_update_time column to campaigns table");
      
      const addColumnQuery = `
        ALTER TABLE campaigns 
        ADD COLUMN budget_update_time TEXT DEFAULT '00:00:00'
      `;
      
      await db.execute(addColumnQuery);
      console.log("✅ Successfully added budget_update_time column");
    } else {
      console.log("Column budget_update_time already exists, skipping migration");
    }
    
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to add budgetUpdateTime field:", error);
    return { success: false, error };
  }
}