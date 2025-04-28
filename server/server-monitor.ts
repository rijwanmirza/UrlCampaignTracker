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
    let cpuInfo;
    try {
      // Always try the OS module first in Replit environment
      const os = require('os');
      console.log("OS module CPU info:", JSON.stringify({
        cpus: os.cpus(),
        cpuCount: os.cpus().length,
        arch: os.arch(),
        platform: os.platform(),
        osType: os.type(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      }, null, 2));
      
      // If OS module provides CPU info, use it directly
      if (os.cpus() && os.cpus().length > 0) {
        const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
        const cpuCount = os.cpus().length;
        const cpuSpeed = os.cpus()[0]?.speed || 0;
        
        cpuInfo = {
          manufacturer: cpuModel.split(' ')[0] || 'Unknown',
          brand: cpuModel,
          speed: cpuSpeed / 1000, // Convert to GHz
          cores: cpuCount,
          physicalCores: Math.max(1, Math.floor(cpuCount / 2)) // Estimate physical cores
        };
        
        console.log("Using OS module CPU info:", JSON.stringify(cpuInfo, null, 2));
      } else {
        // Fallback to systeminformation if OS module doesn't help
        cpuInfo = await si.cpu();
        console.log("CPU Info from systeminformation:", JSON.stringify(cpuInfo, null, 2));
      }
    } catch (err) {
      console.error("Error getting CPU info:", err);
      
      try {
        // Try systeminformation as a fallback
        cpuInfo = await si.cpu();
        console.log("Fallback CPU Info from systeminformation:", JSON.stringify(cpuInfo, null, 2));
      } catch (siErr) {
        console.error("Error in systeminformation fallback:", siErr);
        cpuInfo = {
          manufacturer: 'Unknown',
          brand: 'Unknown CPU',
          speed: 0,
          cores: 0,
          physicalCores: 0
        };
      }
    }
    
    // Get memory usage
    const memory = await si.mem();
    
    // Get network statistics
    const networkStats = await si.networkStats();
    const connections = await si.networkConnections();
    
    // Get system uptime and load average
    const uptime = await si.time();
    const loadavg = await si.currentLoad();
    console.log("Load average data:", JSON.stringify(loadavg, null, 2));
    console.log("OS load averages:", await si.osInfo().then(os => os.platform), require('os').loadavg());
    
    // Calculate memory usage percentage
    const memoryUsagePercent = (memory.total - memory.available) / memory.total * 100;
    
    // Calculate overall system load
    // This gives us a percentage representation of total system load (0-100%)
    // From CPU load, processes, IO operations, etc.
    let systemLoad = 0;
    try {
      // Get load average from OS or systeminformation
      const osLoadAvg = require('os').loadavg()[0];
      console.log("Raw load average:", osLoadAvg);
      
      const numCPUs = require('os').cpus().length || 1;
      console.log("Number of CPUs for load calculation:", numCPUs);
      
      // Convert load average to percentage (normalized by CPU count)
      // Use a minimum of 1 for CPUs to avoid division by zero
      const effectiveCPUs = Math.max(numCPUs, 1);
      systemLoad = Math.min(Math.round((osLoadAvg / effectiveCPUs) * 100), 100);
      console.log("Calculated system load:", systemLoad);
      
      // If system load is very low but not zero, set a minimum sensible value
      // This is because completely 0.0% is unrealistic for a running system
      if (systemLoad === 0 && osLoadAvg > 0) {
        systemLoad = Math.max(1, Math.round(osLoadAvg * 25)); // Convert load average to percentage directly
        console.log("Applied minimum system load:", systemLoad);
      }
      
      // Fallback to loadavg.avgLoad or cpu.currentLoad if available
      if ((isNaN(systemLoad) || systemLoad === 0) && loadavg.avgLoad) {
        systemLoad = Math.min(Math.round(loadavg.avgLoad * 100), 100);
        console.log("Using avgLoad fallback for system load:", systemLoad);
      } else if (isNaN(systemLoad) || systemLoad === 0) {
        systemLoad = Math.min(Math.round(cpu.currentLoad), 100);
        console.log("Using CPU currentLoad fallback for system load:", systemLoad);
      }
    } catch (err) {
      console.error("Error calculating system load:", err);
      // Fallback to CPU load if there's an error
      systemLoad = Math.min(Math.round(cpu.currentLoad), 100);
      console.log("Using error fallback for system load:", systemLoad);
    }
    
    // Create stats object with hard-coded values for CPU to avoid nulls
    const cpuDetails = {
      manufacturer: cpuInfo.manufacturer || 'Replit',
      brand: cpuInfo.brand || 'Replit Virtual CPU',
      speed: cpuInfo.speed || 2.8, // Default to 2.8 GHz if unknown
      cores: cpuInfo.cores || 4,   // Default to 4 logical cores
      physicalCores: cpuInfo.physicalCores || 2 // Default to 2 physical cores
    };
    
    console.log("Final CPU details being set:", JSON.stringify(cpuDetails, null, 2));
    
    const stats: ServerStats = {
      cpuUsage: parseFloat(cpu.currentLoad.toFixed(2)),
      memoryUsage: parseFloat(memoryUsagePercent.toFixed(2)),
      memoryTotal: memory.total,
      memoryFree: memory.available,
      cpuDetails: cpuDetails,
      networkStats: {
        rx_sec: networkStats.reduce((sum, interface_) => sum + interface_.rx_sec, 0),
        tx_sec: networkStats.reduce((sum, interface_) => sum + interface_.tx_sec, 0),
        total_connections: connections.length
      },
      timestamp: new Date(),
      uptime: uptime.uptime,
      loadAverage: require('os').loadavg() || (loadavg.avgLoad ? [loadavg.avgLoad] : [cpu.currentLoad / 100, cpu.currentLoad / 100, cpu.currentLoad / 100]),
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
        manufacturer: 'Replit',
        brand: 'Replit Virtual CPU',
        speed: 2.8, // Default to 2.8 GHz
        cores: 4,   // Default to 4 logical cores
        physicalCores: 2 // Default to 2 physical cores
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