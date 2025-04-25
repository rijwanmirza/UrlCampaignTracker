import { db } from '../db';
import { sql } from 'drizzle-orm';
import { trafficstarCampaigns } from '@shared/schema';

/**
 * Migration script to add dailySpent and dailySpentUpdatedAt fields to trafficstar_campaigns table
 */
export async function addDailySpentFields() {
  try {
    console.log('Running migration: Adding dailySpent and dailySpentUpdatedAt fields to trafficstar_campaigns table');
    
    // Check if the columns already exist
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'trafficstar_campaigns' 
      AND column_name IN ('daily_spent', 'daily_spent_updated_at');
    `);
    
    const existingColumns = checkResult.rows.map((row: any) => row.column_name);
    
    if (!existingColumns.includes('daily_spent')) {
      // Add dailySpent column
      await db.execute(sql`
        ALTER TABLE trafficstar_campaigns 
        ADD COLUMN IF NOT EXISTS daily_spent NUMERIC(10, 2);
      `);
      console.log('✅ Added daily_spent column to trafficstar_campaigns table');
    } else {
      console.log('dailySpent column already exists');
    }
    
    if (!existingColumns.includes('daily_spent_updated_at')) {
      // Add dailySpentUpdatedAt column
      await db.execute(sql`
        ALTER TABLE trafficstar_campaigns 
        ADD COLUMN IF NOT EXISTS daily_spent_updated_at TIMESTAMP;
      `);
      console.log('✅ Added daily_spent_updated_at column to trafficstar_campaigns table');
    } else {
      console.log('dailySpentUpdatedAt column already exists');
    }
    
    console.log('Daily spent fields migration completed successfully');
    return true;
  } catch (error) {
    console.error('Error adding daily spent fields:', error);
    return false;
  }
}

export default addDailySpentFields;