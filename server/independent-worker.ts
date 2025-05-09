/**
 * Independent Worker Class
 * 
 * This class allows various system tasks to run completely independently from each other
 * with their own timing schedules, without interdependencies.
 */

export class IndependentWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRun: Date | null = null;
  
  /**
   * Create a new independent worker
   * 
   * @param name - Unique identifier for this worker
   * @param task - The async function to execute on each run
   * @param interval - Time in milliseconds between executions
   * @param immediate - Whether to run immediately on start (default: false)
   */
  constructor(
    private name: string,
    private task: () => Promise<void>,
    private interval: number,
    private immediate: boolean = false
  ) {}
  
  /**
   * Start the worker
   */
  async start(): Promise<void> {
    console.log(`🚀 Starting independent worker: ${this.name}`);
    
    if (this.immediate) {
      console.log(`⚡ Running ${this.name} worker immediately on startup`);
      try {
        this.isRunning = true;
        await this.task();
      } catch (error) {
        console.error(`❌ Error in worker ${this.name} during initial run:`, error);
      } finally {
        this.isRunning = false;
        this.lastRun = new Date();
      }
    }
    
    this.scheduleNextRun();
  }
  
  /**
   * Schedule the next execution of the task
   */
  private scheduleNextRun(): void {
    this.timer = setTimeout(async () => {
      if (this.isRunning) {
        console.log(`⏱️ Worker ${this.name} is still running, skipping this cycle`);
        this.scheduleNextRun(); // Schedule next run anyway
        return;
      }
      
      try {
        this.isRunning = true;
        console.log(`▶️ Running worker: ${this.name}`);
        await this.task();
        this.lastRun = new Date();
      } catch (error) {
        console.error(`❌ Error in worker ${this.name}:`, error);
      } finally {
        this.isRunning = false;
        this.scheduleNextRun(); // Schedule next run after completion
      }
    }, this.interval);
  }
  
  /**
   * Stop the worker
   */
  stop(): void {
    console.log(`🛑 Stopping worker: ${this.name}`);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  
  /**
   * Get the status of the worker
   */
  getStatus(): { name: string; isRunning: boolean; lastRun: Date | null; interval: number } {
    return {
      name: this.name,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      interval: this.interval
    };
  }
}

/**
 * Independent Worker Manager
 * 
 * Manages all independent workers in the system
 */
export class IndependentWorkerManager {
  private static instance: IndependentWorkerManager;
  private workers: Map<string, IndependentWorker> = new Map();
  
  private constructor() {}
  
  /**
   * Get the singleton instance of the worker manager
   */
  public static getInstance(): IndependentWorkerManager {
    if (!IndependentWorkerManager.instance) {
      IndependentWorkerManager.instance = new IndependentWorkerManager();
    }
    return IndependentWorkerManager.instance;
  }
  
  /**
   * Register a new worker with the manager
   */
  registerWorker(worker: IndependentWorker, name: string): void {
    this.workers.set(name, worker);
  }
  
  /**
   * Get all registered workers
   */
  getWorkers(): Map<string, IndependentWorker> {
    return this.workers;
  }
  
  /**
   * Get a specific worker by name
   */
  getWorker(name: string): IndependentWorker | undefined {
    return this.workers.get(name);
  }
  
  /**
   * Get the status of all workers
   */
  getAllWorkersStatus(): Array<{ name: string; isRunning: boolean; lastRun: Date | null; interval: number }> {
    const statuses: Array<{ name: string; isRunning: boolean; lastRun: Date | null; interval: number }> = [];
    this.workers.forEach((worker, name) => {
      statuses.push(worker.getStatus());
    });
    return statuses;
  }
}