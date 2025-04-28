import si from 'systeminformation';

// Interface for server stats
export interface ServerStats {
  cpuUsage: number; // percentage
  memoryUsage: number; // percentage
  memoryTotal: number; // bytes
  memoryFree: number; // bytes
  cpuDetails: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    physicalCores: number;
  };
  networkStats: {
    rx_sec: number; // bytes received per second
    tx_sec: number; // bytes transmitted per second
    total_connections: number; // total active connections
  };
  timestamp: Date;
  uptime: number; // seconds
  loadAverage: number[]; // 1, 5, 15 minute averages
  systemLoad: number; // percentage (0-100)
}

// Cache stats to prevent excessive polling
let cachedStats: ServerStats | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds cache

/**
 * Get current server statistics
 * Using caching to prevent excessive CPU usage from constant polling
 */
export async function getServerStats(): Promise<ServerStats> {
  const currentTime = Date.now();
  
  // Return cached stats if they're fresh enough
  if (cachedStats && (currentTime - lastFetchTimestamp < CACHE_TTL)) {
    return cachedStats;
  }
  
  try {
    // Get CPU usage - average across all cores
    const cpu = await si.currentLoad();
    
    // Get CPU details
    const cpuInfo = await si.cpu();
    
    // Get memory usage
    const memory = await si.mem();
    
    // Get network statistics
    const networkStats = await si.networkStats();
    const connections = await si.networkConnections();
    
    // Get system uptime and load average
    const uptime = await si.time();
    const loadavg = await si.currentLoad();
    
    // Calculate memory usage percentage
    const memoryUsagePercent = (memory.total - memory.available) / memory.total * 100;
    
    // Calculate overall system load
    // This gives us a percentage representation of total system load (0-100%)
    // From CPU load, processes, IO operations, etc.
    const systemLoad = Math.min(Math.round((loadavg.avgLoad || cpu.currentLoad / 100) * 100), 100);
    
    // Create stats object
    const stats: ServerStats = {
      cpuUsage: parseFloat(cpu.currentLoad.toFixed(2)),
      memoryUsage: parseFloat(memoryUsagePercent.toFixed(2)),
      memoryTotal: memory.total,
      memoryFree: memory.available,
      cpuDetails: {
        manufacturer: cpuInfo.manufacturer || 'Unknown',
        brand: cpuInfo.brand || 'Unknown CPU',
        speed: cpuInfo.speed || 0,
        cores: cpuInfo.cores || 0,
        physicalCores: cpuInfo.physicalCores || 0
      },
      networkStats: {
        rx_sec: networkStats.reduce((sum, interface_) => sum + interface_.rx_sec, 0),
        tx_sec: networkStats.reduce((sum, interface_) => sum + interface_.tx_sec, 0),
        total_connections: connections.length
      },
      timestamp: new Date(),
      uptime: uptime.uptime,
      loadAverage: loadavg.avgLoad ? [loadavg.avgLoad] : [cpu.currentLoad / 100, cpu.currentLoad / 100, cpu.currentLoad / 100],
      systemLoad: systemLoad
    };
    
    // Update cache
    cachedStats = stats;
    lastFetchTimestamp = currentTime;
    
    return stats;
  } catch (error) {
    console.error("Error fetching server stats:", error);
    
    // Return default values if we can't get stats
    return {
      cpuUsage: -1,
      memoryUsage: -1,
      memoryTotal: 0,
      memoryFree: 0,
      cpuDetails: {
        manufacturer: 'Unknown',
        brand: 'Unknown CPU',
        speed: 0,
        cores: 0,
        physicalCores: 0
      },
      networkStats: {
        rx_sec: 0,
        tx_sec: 0,
        total_connections: 0
      },
      timestamp: new Date(),
      uptime: 0,
      loadAverage: [0, 0, 0],
      systemLoad: 0
    };
  }
}

// Historical stats storage for trend analysis
const MAX_HISTORY_POINTS = 60; // Keep 60 data points
let statsHistory: ServerStats[] = [];

/**
 * Record stats to history for trend analysis
 */
export function recordStatsToHistory(stats: ServerStats): void {
  statsHistory.push(stats);
  
  // Maintain maximum size
  if (statsHistory.length > MAX_HISTORY_POINTS) {
    statsHistory.shift(); // Remove oldest entry
  }
}

/**
 * Get historical stats for trend analysis
 */
export function getStatsHistory(): ServerStats[] {
  return statsHistory;
}

/**
 * Start periodic stats collection
 */
export function startStatsCollection(intervalMs = 60000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const stats = await getServerStats();
      recordStatsToHistory(stats);
    } catch (error) {
      console.error("Error collecting stats:", error);
    }
  }, intervalMs);
}

// Initialize stats collection - 1 minute interval
let statsCollectionInterval: NodeJS.Timeout | null = null;

export function initServerMonitor(): void {
  if (!statsCollectionInterval) {
    statsCollectionInterval = startStatsCollection();
    console.log("Server monitoring initialized - collecting stats every minute");
  }
}

export function stopServerMonitor(): void {
  if (statsCollectionInterval) {
    clearInterval(statsCollectionInterval);
    statsCollectionInterval = null;
    console.log("Server monitoring stopped");
  }
}