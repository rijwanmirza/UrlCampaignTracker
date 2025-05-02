/**
 * Migration to add trafficGeneratorEnabled field to the campaigns table
 * 
 * This migration adds the trafficGeneratorEnabled column which enables
 * the Traffic Generator feature for a campaign
 */

// Get a handle to the database client
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Add the trafficGeneratorEnabled column to the campaigns table
 */
async function addTrafficGeneratorEnabledColumn() {
  console.log('Adding trafficGeneratorEnabled column to campaigns table...');
  
  try {
    // Check if column already exists to avoid errors
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'traffic_generator_enabled'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('Column traffic_generator_enabled already exists, skipping migration');
      return;
    }
    
    // Add the column with a default value of false
    await pool.query(`
      ALTER TABLE campaigns 
      ADD COLUMN traffic_generator_enabled BOOLEAN DEFAULT false
    `);
    
    console.log('Successfully added trafficGeneratorEnabled column to campaigns table');
  } catch (error) {
    console.error('Error adding trafficGeneratorEnabled column:', error);
    throw error;
  }
}

// Execute the migration
(async () => {
  try {
    await addTrafficGeneratorEnabledColumn();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
})();

// Export the function for use in other files
export { addTrafficGeneratorEnabledColumn };