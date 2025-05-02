/**
 * Migration to add Traffic Generator fields to the campaigns table
 * 
 * This migration adds the required fields for the Traffic Generator feature:
 * - trafficGeneratorState (text)
 * - trafficGeneratorWaitStartTime (timestamp)
 * - trafficGeneratorWaitMinutes (integer)
 * - budgetedUrlIds (integer[])
 * - pendingUrlBudgets (jsonb)
 * 
 * The trafficGeneratorEnabled field is already added by a previous migration.
 */

// Get a handle to the database client
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Add the Traffic Generator fields to the campaigns table
 */
async function addTrafficGeneratorFields() {
  console.log('Adding Traffic Generator fields to campaigns table...');
  
  try {
    // Start a transaction
    await pool.query('BEGIN');
    
    // Check if trafficGeneratorState column already exists to avoid errors
    const stateColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_generator_state'
    `);
    
    if (stateColumnCheck.rows.length === 0) {
      console.log('Adding traffic_generator_state column...');
      await pool.query(`
        ALTER TABLE campaigns 
        ADD COLUMN traffic_generator_state TEXT DEFAULT 'idle'
      `);
    } else {
      console.log('Column traffic_generator_state already exists, skipping');
    }
    
    // Check if trafficGeneratorWaitStartTime column already exists
    const waitTimeColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_generator_wait_start_time'
    `);
    
    if (waitTimeColumnCheck.rows.length === 0) {
      console.log('Adding traffic_generator_wait_start_time column...');
      await pool.query(`
        ALTER TABLE campaigns 
        ADD COLUMN traffic_generator_wait_start_time TIMESTAMP
      `);
    } else {
      console.log('Column traffic_generator_wait_start_time already exists, skipping');
    }
    
    // Check if trafficGeneratorWaitMinutes column already exists
    const waitMinutesColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_generator_wait_minutes'
    `);
    
    if (waitMinutesColumnCheck.rows.length === 0) {
      console.log('Adding traffic_generator_wait_minutes column...');
      await pool.query(`
        ALTER TABLE campaigns 
        ADD COLUMN traffic_generator_wait_minutes INTEGER DEFAULT 2
      `);
    } else {
      console.log('Column traffic_generator_wait_minutes already exists, skipping');
    }
    
    // Check if budgetedUrlIds column already exists
    const budgetedUrlIdsColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'budgeted_url_ids'
    `);
    
    if (budgetedUrlIdsColumnCheck.rows.length === 0) {
      console.log('Adding budgeted_url_ids column...');
      await pool.query(`
        ALTER TABLE campaigns 
        ADD COLUMN budgeted_url_ids INTEGER[] DEFAULT '{}'
      `);
    } else {
      console.log('Column budgeted_url_ids already exists, skipping');
    }
    
    // Check if pendingUrlBudgets column already exists
    const pendingUrlBudgetsColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'pending_url_budgets'
    `);
    
    if (pendingUrlBudgetsColumnCheck.rows.length === 0) {
      console.log('Adding pending_url_budgets column...');
      await pool.query(`
        ALTER TABLE campaigns 
        ADD COLUMN pending_url_budgets JSONB DEFAULT '{}'
      `);
    } else {
      console.log('Column pending_url_budgets already exists, skipping');
    }
    
    // Commit the transaction
    await pool.query('COMMIT');
    
    console.log('Successfully added Traffic Generator fields to campaigns table');
  } catch (error) {
    // Roll back the transaction in case of error
    await pool.query('ROLLBACK');
    console.error('Error adding Traffic Generator fields:', error);
    throw error;
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Execute the migration
(async () => {
  try {
    await addTrafficGeneratorFields();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();

// Export the function for use in other files
export { addTrafficGeneratorFields };