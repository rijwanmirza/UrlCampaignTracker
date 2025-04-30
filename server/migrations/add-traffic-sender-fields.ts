import { Pool } from 'pg';

/**
 * Traffic Sender Fields Migration
 * 
 * This script adds the necessary fields to the campaigns table to support
 * the Traffic Sender feature. 
 * 
 * Added fields:
 * - traffic_sender_enabled: Determines if traffic sender is enabled for a campaign
 * - last_traffic_sender_action: Timestamp of last traffic sender action
 * - last_traffic_sender_status: Status message of the last traffic sender action
 */

export async function addTrafficSenderFields(pool: Pool): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Check if the columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
        AND column_name = 'traffic_sender_enabled'
    `;
    
    const columnCheck = await client.query(checkQuery);
    
    // If column already exists, migration has been applied
    if (columnCheck.rowCount && columnCheck.rowCount > 0) {
      await client.query('COMMIT');
      return {
        success: true,
        message: 'Migration already applied. Traffic Sender fields already exist.'
      };
    }
    
    // Add the columns to the campaigns table
    const alterTableQuery = `
      ALTER TABLE campaigns
      ADD COLUMN traffic_sender_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN last_traffic_sender_action TIMESTAMP,
      ADD COLUMN last_traffic_sender_status TEXT
    `;
    
    await client.query(alterTableQuery);
    
    // Create index for faster queries
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_campaigns_traffic_sender_enabled 
      ON campaigns(traffic_sender_enabled)
    `;
    
    await client.query(createIndexQuery);
    
    // Commit the transaction
    await client.query('COMMIT');
    
    return {
      success: true,
      message: 'Successfully added Traffic Sender fields to campaigns table'
    };
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    
    return {
      success: false,
      message: 'Failed to add Traffic Sender fields',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    // Release the client back to the pool
    client.release();
  }
}