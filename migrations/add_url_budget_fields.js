/**
 * Migration to add URL budget tracking fields to the urls table
 * 
 * This migration adds:
 * - pendingBudgetUpdate column (boolean) to track URLs waiting for budget update
 * - budgetCalculated column (boolean) to track URLs that have had budget calculated
 */

import pg from 'pg';
const { Pool } = pg;

// Initialize the PostgreSQL client with the database URL from environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Check if the columns already exist to avoid errors
 */
async function checkColumnsExist() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'urls'
      AND column_name IN ('pending_budget_update', 'budget_calculated')
    `);
    
    return {
      pendingBudgetUpdateExists: rows.some(row => row.column_name === 'pending_budget_update'),
      budgetCalculatedExists: rows.some(row => row.column_name === 'budget_calculated')
    };
  } catch (error) {
    console.error('Error checking if columns exist:', error);
    throw error;
  }
}

/**
 * Add the URL budget columns to the urls table
 */
async function addUrlBudgetColumns(columnsExist) {
  try {
    // Add pendingBudgetUpdate column if it doesn't exist
    if (!columnsExist.pendingBudgetUpdateExists) {
      console.log('Adding pending_budget_update column to urls table...');
      await pool.query(`
        ALTER TABLE urls
        ADD COLUMN pending_budget_update BOOLEAN DEFAULT FALSE NOT NULL
      `);
      console.log('✅ Added pending_budget_update column');
    } else {
      console.log('✅ pending_budget_update column already exists');
    }
    
    // Add budgetCalculated column if it doesn't exist
    if (!columnsExist.budgetCalculatedExists) {
      console.log('Adding budget_calculated column to urls table...');
      await pool.query(`
        ALTER TABLE urls
        ADD COLUMN budget_calculated BOOLEAN DEFAULT FALSE NOT NULL
      `);
      console.log('✅ Added budget_calculated column');
    } else {
      console.log('✅ budget_calculated column already exists');
    }
  } catch (error) {
    console.error('Error adding URL budget columns:', error);
    throw error;
  }
}

/**
 * Run the migration
 */
async function runMigration() {
  try {
    // Connect to the database
    const client = await pool.connect();
    try {
      console.log('Starting migration to add URL budget columns...');
      
      // Check if columns already exist
      const columnsExist = await checkColumnsExist();
      
      // Add columns if they don't exist
      await addUrlBudgetColumns(columnsExist);
      
      console.log('Migration completed successfully!');
    } finally {
      // Always release the client
      client.release();
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the migration
runMigration().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});