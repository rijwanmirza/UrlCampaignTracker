import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ServerStats {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryFree: number;
  cpuDetails: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    physicalCores: number;
  };
  osInfo: {
    platform: string;
    distro: string;
    release: string;
    codename: string;
    kernel: string;
    arch: string;
    hostname: string;
  };
  networkStats: {
    rx_sec: number;
    tx_sec: number;
    total_connections: number;
  };
  timestamp: string;
  uptime: number;
  loadAverage: number[];
  systemLoad: number;
}

export function ServerMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

  // Query for current stats
  const { 
    data: serverStats, 
    isLoading, 
    error,
    refetch,
    isRefetching
  } = useQuery<{ success: boolean, data: ServerStats }>({
    queryKey: ["/api/system/server-stats"],
    refetchInterval: refreshInterval,
  });

  // Query for historical stats
  const { 
    data: historyData,
    isLoading: isHistoryLoading
  } = useQuery<{ success: boolean, data: ServerStats[] }>({
    queryKey: ["/api/system/server-stats/history"],
    refetchInterval: refreshInterval,
  });

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    const newState = !autoRefresh;
    setAutoRefresh(newState);
    
    if (newState) {
      setRefreshInterval(5000); // Refresh every 5 seconds
    } else {
      setRefreshInterval(null); // Stop auto-refresh
    }
  };

  // Manually trigger a refresh
  const handleRefresh = () => {
    refetch();
  };

  // Format bytes to human-readable format
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Create chart data from history
  const createChartData = (field: 'cpuUsage' | 'memoryUsage') => {
    if (!historyData?.data || historyData.data.length === 0) return [];
    
    return historyData.data.map((stat, index) => {
      const timestamp = new Date(stat.timestamp);
      return {
        name: `${timestamp.getHours()}:${timestamp.getMinutes().toString().padStart(2, '0')}`,
        value: stat[field],
        index
      };
    });
  };

  // Format uptime to human readable
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading server statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Server Stats</CardTitle>
          <CardDescription>
            Could not load server statistics. Please try again later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = serverStats?.data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Server Monitoring</h3>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAutoRefresh}
            className={autoRefresh ? "bg-green-50" : ""}
          >
            {autoRefresh ? "Auto Refresh: ON" : "Auto Refresh: OFF"}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Current Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CPU Usage</CardTitle>
            <CardDescription>Current processor utilization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">{stats?.cpuUsage.toFixed(1)}%</div>
            <Progress value={stats?.cpuUsage} className="h-2" />
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Memory Usage</CardTitle>
            <CardDescription>RAM utilization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">{stats?.memoryUsage.toFixed(1)}%</div>
            <Progress value={stats?.memoryUsage} className="h-2" />
            <div className="text-xs text-muted-foreground mt-2">
              {formatBytes(stats?.memoryTotal - stats?.memoryFree)} of {formatBytes(stats?.memoryTotal)}
            </div>
          </CardContent>
        </Card>

        {/* Network */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Network</CardTitle>
            <CardDescription>Current network activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Active Connections</div>
                <div className="text-xl font-bold">{stats?.networkStats.total_connections}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Transfer Rate</div>
                <div className="text-xl font-bold">{formatBytes(stats?.networkStats.rx_sec + stats?.networkStats.tx_sec)}/s</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Server Info */}
      <Card>
        <CardHeader>
          <CardTitle>Server Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-medium">Uptime</h4>
              <p className="text-lg">{formatUptime(stats?.uptime || 0)}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium">System Load</h4>
              <div className="flex items-center gap-2">
                <Progress value={stats?.systemLoad || 0} className="h-2 w-24" />
                <p className="text-lg">{stats?.systemLoad !== undefined ? stats.systemLoad.toFixed(1) : '0.0'}%</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium">Last Updated</h4>
              <p className="text-lg">{stats ? new Date(stats.timestamp).toLocaleTimeString() : '-'}</p>
            </div>
          </div>
          
          {/* OS Information */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-medium mb-2">Operating System Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">OS Platform</p>
                <p className="text-sm font-medium">{stats?.osInfo?.platform || 'Linux'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distribution</p>
                <p className="text-sm font-medium">{stats?.osInfo?.distro || 'Ubuntu/Debian/AlmaLinux'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Version</p>
                <p className="text-sm font-medium">{stats?.osInfo?.release || '22.04 LTS'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kernel</p>
                <p className="text-sm font-medium">{stats?.osInfo?.kernel || '5.10.x'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Architecture</p>
                <p className="text-sm font-medium">{stats?.osInfo?.arch || 'x86_64'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hostname</p>
                <p className="text-sm font-medium">{stats?.osInfo?.hostname || 'replit-server'}</p>
              </div>
            </div>
          </div>
          
          {/* CPU Details */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-medium mb-2">CPU Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Processor</p>
                <p className="text-sm font-medium">{stats?.cpuDetails?.brand || 'Replit Virtual CPU'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Manufacturer</p>
                <p className="text-sm font-medium">{stats?.cpuDetails?.manufacturer || 'Replit'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Speed</p>
                <p className="text-sm font-medium">{stats?.cpuDetails?.speed || 2.8} GHz</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Logical Cores</p>
                <p className="text-sm font-medium">{stats?.cpuDetails?.cores || 4}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Physical Cores</p>
                <p className="text-sm font-medium">{stats?.cpuDetails?.physicalCores || 2}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Load Average</p>
                <p className="text-sm font-medium">{stats?.loadAverage?.map(load => load.toFixed(2)).join(', ') || '0.00'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Charts */}
      <Tabs defaultValue="cpu">
        <TabsList>
          <TabsTrigger value="cpu">CPU History</TabsTrigger>
          <TabsTrigger value="memory">Memory History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="cpu" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>CPU Usage History</CardTitle>
              <CardDescription>CPU utilization over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isHistoryLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : historyData?.data && historyData.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={createChartData('cpuUsage')}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip formatter={(value) => [`${value}%`, 'CPU Usage']} />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#8884d8" 
                        strokeWidth={2}
                        dot={false}
                        name="CPU Usage"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No historical data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="memory" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Memory Usage History</CardTitle>
              <CardDescription>Memory utilization over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {isHistoryLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : historyData?.data && historyData.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={createChartData('memoryUsage')}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Memory Usage']} />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#82ca9d" 
                        strokeWidth={2}
                        dot={false}
                        name="Memory Usage"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No historical data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}