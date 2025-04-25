import { db } from "../db";

/**
 * Check if the budgetUpdateTime column migration is needed
 */
export async function isBudgetUpdateTimeMigrationNeeded(): Promise<boolean> {
  try {
    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
      AND column_name = 'budget_update_time'
    `;
    
    const result = await db.execute(checkQuery);
    
    return result.rowCount === 0;
  } catch (error) {
    console.error("Error checking if budget update time migration is needed:", error);
    // If there's an error, assume migration is needed to be safe
    return true;
  }
}

/**
 * Check if the TrafficStar fields migration is needed
 */
export async function isTrafficStarFieldsMigrationNeeded(): Promise<boolean> {
  try {
    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
      AND column_name = 'trafficstar_campaign_id'
    `;
    
    const result = await db.execute(checkQuery);
    
    return result.rowCount === 0;
  } catch (error) {
    console.error("Error checking if TrafficStar fields migration is needed:", error);
    // If there's an error, assume migration is needed to be safe
    return true;
  }
}

/**
 * Check if the daily spent fields migration is needed
 */
export async function isDailySpentFieldsMigrationNeeded(): Promise<boolean> {
  try {
    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'trafficstar_campaigns' 
      AND column_name = 'daily_spent'
    `;
    
    const result = await db.execute(checkQuery);
    
    return result.rowCount === 0;
  } catch (error) {
    console.error("Error checking if daily spent fields migration is needed:", error);
    // If there's an error, assume migration is needed to be safe
    return true;
  }
}