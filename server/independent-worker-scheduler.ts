/**
 * Independent Worker Scheduler
 * 
 * This file initializes and manages the independent workers for traffic management.
 * Each worker runs on its own schedule without dependencies on other processes.
 */

import { IndependentWorker, IndependentWorkerManager } from './independent-worker';
import {
  processSpentValueChecks,
  processUrlThresholdChecks,
  processEmptyUrlChecks,
  processCampaignStatusMonitoring
} from './independent-processing';

// Time Constants (in milliseconds)
const MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * MINUTE;
const THREE_MINUTES = 3 * MINUTE;
const TWO_MINUTES = 2 * MINUTE;
const ONE_MINUTE = 1 * MINUTE;

/**
 * Initialize Independent Workers
 * 
 * This function sets up all the independent workers to handle different aspects
 * of the traffic management system.
 */
export function initializeIndependentWorkers(): void {
  console.log('🚀 Initializing independent workers for traffic management');
  
  const workerManager = IndependentWorkerManager.getInstance();
  
  // 1. Spent Value Checker Worker
  // Checks campaign spent values independently
  const spentValueCheckWorker = new IndependentWorker(
    'spent-value-checker',
    async () => {
      console.log('💰 Running independent spent value check');
      await processSpentValueChecks();
    },
    FIVE_MINUTES, // Check every 5 minutes
    true // Run immediately on startup
  );
  
  // 2. URL Threshold Worker
  // Checks URL thresholds for pausing/activating campaigns
  const urlThresholdWorker = new IndependentWorker(
    'url-threshold-checker',
    async () => {
      console.log('📊 Running independent URL threshold check');
      await processUrlThresholdChecks();
    },
    THREE_MINUTES, // Check every 3 minutes
    true // Run immediately on startup
  );
  
  // 3. Empty URL Worker
  // Checks for campaigns with no active URLs
  const emptyUrlWorker = new IndependentWorker(
    'empty-url-checker',
    async () => {
      console.log('🔍 Running independent empty URL check');
      await processEmptyUrlChecks();
    },
    TWO_MINUTES, // Check every 2 minutes
    true // Run immediately on startup
  );
  
  // 4. Campaign Status Monitor Worker
  // Continuously monitors campaign status for active/paused state
  const statusMonitorWorker = new IndependentWorker(
    'status-monitor',
    async () => {
      console.log('🔄 Running independent status monitoring checks');
      await processCampaignStatusMonitoring();
    },
    ONE_MINUTE, // Check every minute
    true // Run immediately on startup
  );
  
  // Register all workers with the manager
  workerManager.registerWorker(spentValueCheckWorker, 'spent-value-checker');
  workerManager.registerWorker(urlThresholdWorker, 'url-threshold-checker');
  workerManager.registerWorker(emptyUrlWorker, 'empty-url-checker');
  workerManager.registerWorker(statusMonitorWorker, 'status-monitor');
  
  // Start all workers
  spentValueCheckWorker.start();
  urlThresholdWorker.start();
  emptyUrlWorker.start();
  statusMonitorWorker.start();
  
  console.log('✅ All independent workers started successfully');
}

/**
 * Get Worker Status
 * 
 * Returns the status of all registered workers
 * 
 * @returns The status of all workers
 */
export function getWorkerStatus(): Array<{ name: string; isRunning: boolean; lastRun: Date | null; interval: number }> {
  const workerManager = IndependentWorkerManager.getInstance();
  return workerManager.getAllWorkersStatus();
}

export default {
  initializeIndependentWorkers,
  getWorkerStatus
};