/**
 * Migration to add lastBudgetUpdateTime field to the campaigns table
 * 
 * This migration adds the lastBudgetUpdateTime column which is used by the
 * Traffic Sender feature to track when the budget was last updated for
 * new URLs with the 12-minute waiting period
 */

import pkg from 'pg';
const { Pool } = pkg;

// Create a connection pool using the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Add the lastBudgetUpdateTime column to the campaigns table
 */
async function addLastBudgetUpdateTimeColumn() {
  const client = await pool.connect();
  
  try {
    // Begin transaction
    await client.query('BEGIN');
    
    console.log('Adding lastBudgetUpdateTime column to campaigns table...');
    
    // Check if the column already exists to avoid errors
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'last_budget_update_time'
    `);
    
    if (columnCheck.rows.length === 0) {
      // Add the lastBudgetUpdateTime column
      await client.query(`
        ALTER TABLE campaigns
        ADD COLUMN last_budget_update_time TIMESTAMP
      `);
      
      console.log('✅ lastBudgetUpdateTime column added successfully');
    } else {
      console.log('Column lastBudgetUpdateTime already exists, skipping...');
    }
    
    // Commit the changes
    await client.query('COMMIT');
    console.log('Migration completed successfully');
    
  } catch (error) {
    // If there's an error, roll back the changes
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Run the migration
addLastBudgetUpdateTimeColumn()
  .then(() => {
    console.log('Migration completed, exiting...');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed with error:', error);
    process.exit(1);
  });