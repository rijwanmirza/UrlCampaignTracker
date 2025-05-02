import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Pause, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";

export function TrafficGeneratorStatus({ campaignId }: { campaignId: number }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch Traffic Generator status
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['/api/traffic-generator/status', campaignId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/traffic-generator/status/${campaignId}`);
      return await response.json();
    },
    refetchInterval: 10000, // Refresh status every 10 seconds
  });

  // Use to manually refresh status
  const refreshStatus = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['/api/traffic-generator/status', campaignId] });
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  // Run Traffic Generator manually
  const runGenerator = async () => {
    try {
      await apiRequest('POST', `/api/traffic-generator/run/${campaignId}`);
      await queryClient.invalidateQueries({ queryKey: ['/api/traffic-generator/status', campaignId] });
    } catch (error) {
      console.error("Error running Traffic Generator:", error);
    }
  };

  // Get badge color based on state
  const getStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      idle: "bg-gray-100 text-gray-800",
      waiting: "bg-blue-100 text-blue-800",
      condition1: "bg-green-100 text-green-800",
      condition2: "bg-purple-100 text-purple-800",
    };
    return colors[state] || "bg-gray-100 text-gray-800";
  };

  // Format state name for display
  const formatStateName = (state: string) => {
    const names: Record<string, string> = {
      idle: "Idle",
      waiting: "Waiting",
      condition1: "Condition #1 (<$10)",
      condition2: "Condition #2 (≥$10)",
    };
    return names[state] || state;
  };

  // Calculate wait time progress if in waiting state
  const calculateWaitProgress = () => {
    if (!status || status.state !== 'waiting' || !status.waitStartTime) return 0;
    
    const startTime = new Date(status.waitStartTime).getTime();
    const waitMs = (status.waitMinutes || 2) * 60 * 1000;
    const endTime = startTime + waitMs;
    const now = new Date().getTime();
    
    if (now >= endTime) return 100;
    return Math.round(((now - startTime) / waitMs) * 100);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Traffic Generator Status</CardTitle>
          <CardDescription>Loading status...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Traffic Generator Status</CardTitle>
          <CardDescription>Error loading status</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">Failed to load Traffic Generator status</p>
          <Button variant="outline" className="mt-2" onClick={refreshStatus}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Traffic Generator Status</CardTitle>
            <CardDescription>Real-time campaign monitoring</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={refreshStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {status ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Current State:</span>
                <Badge className={getStateBadge(status.state)}>
                  {formatStateName(status.state)}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Campaign Status:</span>
                <Badge variant={status.isActive ? "success" : "destructive"}>
                  {status.isActive ? "Active" : "Paused"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Remaining Clicks:</span>
                <span className="font-mono text-sm">
                  {status.remainingClicks?.toLocaleString() || "N/A"}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Daily Spent:</span>
                <span className="font-mono text-sm">
                  ${status.dailySpent ? parseFloat(status.dailySpent).toFixed(4) : "0.0000"}
                </span>
              </div>
              
              {status.state === 'waiting' && (
                <>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-medium">Wait Progress:</span>
                    <span className="text-xs text-gray-500">
                      {calculateWaitProgress()}%
                    </span>
                  </div>
                  <Progress value={calculateWaitProgress()} className="h-2" />
                  <div className="text-xs text-gray-500 pt-1">
                    Waiting for {status.waitMinutes || 2} minutes before checking spent value
                  </div>
                </>
              )}
              
              {status.state === 'condition1' && (
                <div className="text-xs text-gray-500 pt-1">
                  <strong>Condition #1 active:</strong> Monitoring clicks, starts if &gt;15,000 remaining,
                  pauses if ≤5,000 remaining.
                </div>
              )}
              
              {status.state === 'condition2' && (
                <div className="text-xs text-gray-500 pt-1">
                  <strong>Condition #2 active:</strong> Using budget management based on 
                  price/1000 × remaining clicks.
                </div>
              )}
              
              {status.pendingUrlBudgets && Object.keys(status.pendingUrlBudgets).length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium mb-1">Pending URL Budgets:</div>
                  <div className="text-xs bg-gray-50 p-2 rounded border">
                    {Object.entries(status.pendingUrlBudgets).map(([urlId, budget]) => (
                      <div key={urlId} className="flex justify-between">
                        <span>URL #{urlId}:</span>
                        <span>${parseFloat(budget as string).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button 
                variant="default" 
                size="sm" 
                className="gap-1"
                onClick={runGenerator}
              >
                <Play className="h-4 w-4" />
                Run Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-gray-500">
            No status data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}