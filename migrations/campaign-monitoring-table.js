/**
 * Campaign Monitoring Table Migration
 * 
 * This migration creates the campaign_monitoring table
 * for tracking independent worker monitoring state.
 */

// We need to use client.query directly since we're creating a table
// that isn't yet defined in the schema
export async function migrate(client) {
  console.log('Running migration: Create campaign_monitoring table');
  
  try {
    // Create the campaign_monitoring table
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_monitoring (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL,
        trafficstar_campaign_id TEXT NOT NULL,
        type TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        added_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(campaign_id, type)
      );
    `);
    
    console.log('✅ Successfully created campaign_monitoring table');
    return { success: true };
  } catch (error) {
    console.error('❌ Error creating campaign_monitoring table:', error);
    throw error;
  }
}

export async function rollback(client) {
  console.log('Rolling back: Drop campaign_monitoring table');
  
  try {
    await client.query(`
      DROP TABLE IF EXISTS campaign_monitoring;
    `);
    
    console.log('✅ Successfully dropped campaign_monitoring table');
    return { success: true };
  } catch (error) {
    console.error('❌ Error dropping campaign_monitoring table:', error);
    throw error;
  }
}