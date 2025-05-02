/**
 * Migration to add postPauseCheckMinutes field to the campaigns table
 * 
 * This migration adds the postPauseCheckMinutes column which is used by the
 * Traffic Generator feature to specify how long to wait after pausing a campaign
 * before checking the spent value (1-30 minutes).
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Check if the column already exists to avoid errors
 */
async function checkColumnExists() {
  try {
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'campaigns'
      AND column_name = 'post_pause_check_minutes';
    `);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking for column existence:', error);
    throw error;
  }
}

/**
 * Add the postPauseCheckMinutes column to the campaigns table
 */
async function addPostPauseCheckMinutesColumn() {
  const exists = await checkColumnExists();
  
  if (exists) {
    console.log('The post_pause_check_minutes column already exists. Skipping migration.');
    return;
  }

  try {
    // Add the column with a default value of 2 minutes
    await pool.query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS post_pause_check_minutes INTEGER DEFAULT 2;
    `);
    console.log('Successfully added post_pause_check_minutes column to campaigns table');
  } catch (error) {
    console.error('Error adding post_pause_check_minutes column:', error);
    throw error;
  }
}

/**
 * Run the migration
 */
async function runMigration() {
  try {
    console.log('Starting migration: Adding post_pause_check_minutes column to campaigns table');
    await addPostPauseCheckMinutesColumn();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();