/**
 * Click Protection Utility
 * 
 * This utility provides functions to ensure click values are never automatically
 * modified during TrafficStar or other external API synchronization processes.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';

/**
 * Execute a callback within auto-sync context
 * This marks operations as automatic, so they can't modify click values
 * 
 * @param {Function} callback - The function to execute in auto-sync context
 * @returns {Promise<any>} - Result of the callback
 */
export async function withAutoSyncContext(callback) {
  let syncOperationId = null;
  
  try {
    // Start a new auto-sync operation
    const [result] = await db.execute(sql`SELECT start_auto_sync() AS operation_id`);
    syncOperationId = result.operation_id;
    
    console.log(`Started auto-sync operation with ID: ${syncOperationId}`);
    
    // Execute the callback within this context
    return await callback();
  } finally {
    // End the auto-sync operation if it was started
    if (syncOperationId) {
      await db.execute(sql`SELECT end_auto_sync(${syncOperationId})`);
      console.log(`Ended auto-sync operation with ID: ${syncOperationId}`);
    }
  }
}

/**
 * Mark a function as being part of an automatic sync process
 * Any click-related updates within this function will be blocked
 * 
 * @param {Function} func - Function to mark as auto-sync
 * @returns {Function} - Wrapped function that sets auto-sync context
 */
export function markAsAutoSync(func) {
  return async function(...args) {
    return withAutoSyncContext(() => func.apply(this, args));
  };
}

/**
 * Check if click protection is enabled
 * 
 * @returns {Promise<boolean>} - Whether click protection is enabled
 */
export async function isClickProtectionEnabled() {
  const [result] = await db.execute(sql`SELECT click_protection_enabled() AS enabled`);
  return result?.enabled === true;
}

/**
 * Enable or disable click protection
 * 
 * @param {boolean} enabled - Whether protection should be enabled
 * @returns {Promise<void>}
 */
export async function setClickProtectionEnabled(enabled) {
  await db.execute(sql`
    UPDATE protection_settings 
    SET value = ${enabled} 
    WHERE key = 'click_protection_enabled'
  `);
  
  console.log(`Click protection ${enabled ? 'enabled' : 'disabled'}`);
}