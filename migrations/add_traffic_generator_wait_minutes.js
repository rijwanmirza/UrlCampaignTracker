/**
 * Migration to add trafficGeneratorWaitMinutes field to the campaigns table
 * 
 * This migration adds the trafficGeneratorWaitMinutes column which allows 
 * customizing the wait time after pausing a campaign (1-60 minutes)
 */

// Get a handle to the database client
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Add the trafficGeneratorWaitMinutes column to the campaigns table
 */
async function addTrafficGeneratorWaitMinutesColumn() {
  console.log('Adding trafficGeneratorWaitMinutes column to campaigns table...');
  
  try {
    // Check if column already exists to avoid errors
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_generator_wait_minutes'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('Column traffic_generator_wait_minutes already exists, skipping migration');
      return;
    }
    
    // Add the column with a default value of 2 minutes
    await pool.query(`
      ALTER TABLE campaigns 
      ADD COLUMN traffic_generator_wait_minutes INTEGER DEFAULT 2
    `);
    
    console.log('Successfully added trafficGeneratorWaitMinutes column to campaigns table');
  } catch (error) {
    console.error('Error adding trafficGeneratorWaitMinutes column:', error);
    throw error;
  }
}

// Execute the migration
(async () => {
  try {
    await addTrafficGeneratorWaitMinutesColumn();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();

// Export the function for use in other files
export { addTrafficGeneratorWaitMinutesColumn };