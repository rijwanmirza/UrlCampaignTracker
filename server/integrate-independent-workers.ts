/**
 * Independent Workers Integration
 * 
 * This file integrates the independent workers system with the existing traffic generator.
 * It provides a compatibility layer to transition from the old monolithic system to the new 
 * independently running workers.
 */

import { initializeIndependentWorkers } from './independent-worker-scheduler';

/**
 * Initialize Independent Workers System
 * 
 * This function initializes the independent workers system for traffic management.
 * It should be called from the main index.ts file.
 */
export function initializeIndependentWorkerSystem(): void {
  console.log('🚀 Initializing independent worker system for traffic management');
  
  try {
    // Initialize the workers
    initializeIndependentWorkers();
    
    console.log('✅ Independent worker system started successfully');
  } catch (error) {
    console.error('❌ Error initializing independent worker system:', error);
    throw error;
  }
}

/**
 * Get Independent Worker Status
 * 
 * Returns the status of all independent workers
 * 
 * @returns The status of all workers
 */
export function getIndependentWorkerStatus(): Array<{ name: string; isRunning: boolean; lastRun: Date | null; interval: number }> {
  try {
    const { getWorkerStatus } = require('./independent-worker-scheduler');
    return getWorkerStatus();
  } catch (error) {
    console.error('❌ Error getting worker status:', error);
    return [];
  }
}

export default {
  initializeIndependentWorkerSystem,
  getIndependentWorkerStatus
};