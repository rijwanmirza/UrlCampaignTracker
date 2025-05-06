/**
 * Migration to add highSpendWaitMinutes field to the campaigns table
 * 
 * This migration adds the highSpendWaitMinutes column which is used by the
 * Traffic Generator feature to specify how long to wait after pausing a high-spend campaign
 * before checking the spent value and updating the budget (1-30 minutes).
 */

import pkg from 'pg';
const { Pool } = pkg;

// Define the database pool connection
const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: process.env.PGPORT,
    };

const pool = new Pool(poolConfig);

/**
 * Check if the column already exists to avoid errors
 */
async function checkColumnExists() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' 
      AND column_name = 'high_spend_wait_minutes'
    `);
    return rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Add the highSpendWaitMinutes column to the campaigns table
 */
async function addHighSpendWaitMinutesColumn() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE campaigns 
      ADD COLUMN high_spend_wait_minutes INTEGER DEFAULT 11
    `);
    console.log('Migration: Successfully added high_spend_wait_minutes column to campaigns table');
  } finally {
    client.release();
  }
}

/**
 * Run the migration
 */
async function runMigration() {
  try {
    const columnExists = await checkColumnExists();
    
    if (columnExists) {
      console.log('Migration: high_spend_wait_minutes column already exists, skipping');
    } else {
      await addHighSpendWaitMinutesColumn();
      console.log('Migration: high_spend_wait_minutes column added successfully');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Close the pool when done
    await pool.end();
  }
}

// Run the migration
runMigration();