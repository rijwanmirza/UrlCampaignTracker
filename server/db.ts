import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

console.log("Connecting to database:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

// Create PostgreSQL pool with standard node-postgres
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// Test connection on startup
pool.query('SELECT 1')
  .then(() => console.log('✅ Database connection successful'))
  .catch(err => console.error('❌ Database connection error:', err));

// Create drizzle orm instance
export const db = drizzle(pool, { schema });
