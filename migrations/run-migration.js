import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create a PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create the campaign_monitoring table
async function createCampaignMonitoringTable() {
  console.log('Running migration: Create campaign_monitoring table');
  
  try {
    // Create the campaign_monitoring table
    await pool.query(`
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
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the migration
createCampaignMonitoringTable()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });