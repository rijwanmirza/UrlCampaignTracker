/**
 * Utility to mark database operations as being part of an automatic sync
 * This ensures the database triggers know when an update is automatic vs. user-initiated
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';

/**
 * Execute a callback within an auto-sync context
 * @param {Function} callback - Function to execute within auto-sync context
 * @returns {Promise<any>} - Result of the callback
 */
export async function withAutoSyncContext(callback) {
  try {
    // Set the auto-sync flag in the database session
    await db.execute(sql`SET LOCAL app.is_auto_sync = 'true'`);
    
    // Execute the callback
    return await callback();
  } finally {
    // Reset the flag (though it's automatically reset at the end of the transaction)
    await db.execute(sql`SET LOCAL app.is_auto_sync = 'false'`);
  }
}

/**
 * Mark a function as being part of an automatic sync process
 * @param {Function} func - Function to mark as auto-sync
 * @returns {Function} - Wrapped function that sets auto-sync context
 */
export function markAsAutoSync(func) {
  return async function(...args) {
    return withAutoSyncContext(() => func.apply(this, args));
  };
}