import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Pause, RefreshCw, AlertCircle, ArrowRight, Clock, DollarSign, CheckCircle, BarChart3, AlarmClock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TrafficGeneratorStatus({ campaignId }: { campaignId: number }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch Traffic Generator status
  const { data: statusData, isLoading, error } = useQuery({
    queryKey: ['/api/traffic-generator/status', campaignId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/traffic-generator/status/${campaignId}`);
      return await response.json();
    },
    refetchInterval: 10000, // Refresh status every 10 seconds
  });
  
  // Also fetch campaign data to get additional information
  const { data: campaignData } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/campaigns/${campaignId}`);
      return await response.json();
    },
    refetchInterval: 30000, // Refresh campaign data every 30 seconds
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
    if (!statusData?.status || statusData.status.state !== 'waiting' || !statusData.status.waitStartTime) return 0;
    
    // If API returns remaining wait seconds directly, use that for more accurate timing
    if (statusData.status.remainingWaitSeconds !== null && statusData.status.remainingWaitSeconds !== undefined) {
      const totalWaitMs = (statusData.status.waitMinutes || 2) * 60 * 1000;
      const remainingMs = statusData.status.remainingWaitSeconds * 1000;
      const elapsedMs = totalWaitMs - remainingMs;
      
      if (remainingMs <= 0) return 100;
      return Math.round((elapsedMs / totalWaitMs) * 100);
    }
    
    // Fallback to client-side calculation if API doesn't return remaining seconds
    const startTime = new Date(statusData.status.waitStartTime).getTime();
    const waitMs = (statusData.status.waitMinutes || 2) * 60 * 1000;
    const endTime = startTime + waitMs;
    const now = new Date().getTime();
    
    if (now >= endTime) return 100;
    return Math.round(((now - startTime) / waitMs) * 100);
  };
  
  // Format remaining wait time as MM:SS
  const formatRemainingTime = () => {
    if (!statusData?.status || statusData.status.state !== 'waiting') return '00:00';
    
    let remainingSeconds;
    
    // Use API provided remaining seconds if available
    if (statusData.status.remainingWaitSeconds !== null && statusData.status.remainingWaitSeconds !== undefined) {
      remainingSeconds = statusData.status.remainingWaitSeconds;
    } else {
      // Fallback to client-side calculation
      const startTime = new Date(statusData.status.waitStartTime).getTime();
      const waitMs = (statusData.status.waitMinutes || 2) * 60 * 1000;
      const endTime = startTime + waitMs;
      const now = new Date().getTime();
      
      remainingSeconds = Math.max(0, Math.ceil((endTime - now) / 1000));
    }
    
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="mr-2 h-5 w-5 text-primary" />
              Traffic Generator Status
            </CardTitle>
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
        {statusData?.status ? (
          <div className="space-y-4">
            {/* State Header */}
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${
                  statusData.status.state === 'idle' ? 'bg-gray-400' : 
                  statusData.status.state === 'waiting' ? 'bg-blue-400' : 
                  statusData.status.state === 'condition1' ? 'bg-green-400' : 
                  statusData.status.state === 'condition2' ? 'bg-purple-400' : 'bg-gray-400'
                }`}></div>
                <span className="font-medium">Generator Status</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={getStateBadge(statusData.status.state || "idle")}>
                      {formatStateName(statusData.status.state || "idle")}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {statusData.status.state === 'idle' ? 'Monitoring campaign status' : 
                       statusData.status.state === 'waiting' ? 'Waiting after pause before checking spent value' : 
                       statusData.status.state === 'condition1' ? 'Using click-based logic (spent < $10)' : 
                       statusData.status.state === 'condition2' ? 'Using budget-based logic (spent ≥ $10)' : 
                       'Unknown state'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-2 rounded-lg">
                <div className="text-xs text-gray-500 mb-1 flex items-center">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Daily Spent
                </div>
                <div className="font-mono font-medium">
                  ${campaignData?.dailySpent ? parseFloat(campaignData.dailySpent).toFixed(4) : "0.0000"}
                </div>
              </div>
              
              <div className="bg-gray-50 p-2 rounded-lg">
                <div className="text-xs text-gray-500 mb-1 flex items-center">
                  <BarChart3 className="h-3 w-3 mr-1" />
                  Remaining Clicks
                </div>
                <div className="font-mono font-medium">
                  {statusData.remainingClicks?.toLocaleString() || "0"}
                </div>
              </div>
              
              <div className="bg-gray-50 p-2 rounded-lg">
                <div className="text-xs text-gray-500 mb-1 flex items-center">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Campaign Status
                </div>
                <div>
                  <Badge variant={campaignData?.lastTrafficstarStatus === 'active' ? "success" : "destructive"} className="font-medium text-xs">
                    {campaignData?.lastTrafficstarStatus === 'active' ? "Active" : "Paused"}
                  </Badge>
                </div>
              </div>
              
              <div className="bg-gray-50 p-2 rounded-lg">
                <div className="text-xs text-gray-500 mb-1 flex items-center">
                  <AlarmClock className="h-3 w-3 mr-1" />
                  Wait Time
                </div>
                <div className="font-mono font-medium">
                  {statusData.status.waitMinutes || 2} min
                </div>
              </div>
            </div>
            
            {/* State-Specific Information */}
            <div className="flex flex-col gap-3">
              {statusData.status.state === 'waiting' && (
                <div className="border rounded-lg p-3 bg-blue-50">
                  <div className="flex items-center justify-between text-sm font-medium text-blue-700 mb-2">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2" />
                      Wait Progress
                    </div>
                    <div className="flex items-center bg-blue-100 px-2 py-1 rounded">
                      <AlarmClock className="h-3 w-3 mr-1 text-blue-700" />
                      <span className="font-mono text-xs">{formatRemainingTime()}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-blue-600">
                      {statusData.status.waitStartTime ? new Date(statusData.status.waitStartTime).toLocaleTimeString() : ''}
                    </span>
                    <span className="text-xs text-blue-600 font-mono">
                      {calculateWaitProgress()}%
                    </span>
                  </div>
                  <Progress value={calculateWaitProgress()} className="h-2 bg-blue-200" indicatorClassName="bg-blue-500" />
                  <div className="text-xs text-blue-600 mt-2 flex items-start">
                    <AlertCircle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                    <span>
                      Waiting for {statusData.status.waitMinutes || 2} minutes before checking TrafficStar spent value.
                      The system will strictly honor this wait time.
                    </span>
                  </div>
                </div>
              )}
              
              {statusData.status.state === 'condition1' && (
                <div className="border rounded-lg p-3 bg-green-50">
                  <div className="flex items-center text-sm font-medium text-green-700 mb-1">
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Condition #1 Active (Daily Spent &lt; $10)
                  </div>
                  <div className="text-xs text-green-600">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Campaign will be <strong>started</strong> if remaining clicks <strong>&gt; 15,000</strong></li>
                      <li>Campaign will be <strong>paused</strong> if remaining clicks <strong>≤ 5,000</strong></li>
                      <li>End time will be set to 23:59 UTC today when started</li>
                    </ul>
                  </div>
                </div>
              )}
              
              {statusData.status.state === 'condition2' && (
                <div className="border rounded-lg p-3 bg-purple-50">
                  <div className="flex items-center text-sm font-medium text-purple-700 mb-1">
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Condition #2 Active (Daily Spent ≥ $10)
                  </div>
                  <div className="text-xs text-purple-600">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Using budget-based management for the campaign</li>
                      <li>Budget calculated as: price/1000 × remaining clicks</li>
                      <li>For high budgets (≥$50), updates are applied incrementally</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
            
            {/* Pending URL Budgets */}
            {statusData.status.pendingUrlBudgets && Object.keys(statusData.status.pendingUrlBudgets).length > 0 && (
              <div className="border rounded-lg p-3">
                <div className="text-sm font-medium mb-2 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  Pending URL Budgets
                </div>
                <div className="text-xs bg-gray-50 p-2 rounded border max-h-40 overflow-y-auto">
                  {Object.entries(statusData.status.pendingUrlBudgets).map(([urlId, budget]) => (
                    <div key={urlId} className="flex justify-between py-1 border-b last:border-b-0">
                      <span>URL #{urlId}:</span>
                      <span className="font-mono">
                        ${typeof budget === 'string' ? parseFloat(budget).toFixed(2) : parseFloat(String(budget)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <Alert className="mt-2 bg-amber-50 border-amber-200 p-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-xs text-amber-600">
                    These budgets will be applied when campaign spent reaches (current budget - $1)
                  </AlertDescription>
                </Alert>
              </div>
            )}
            
            {/* Budgeted URLs */}
            {statusData.status.budgetedUrlIds && statusData.status.budgetedUrlIds.length > 0 && (
              <div className="border rounded-lg p-3">
                <div className="text-sm font-medium mb-2 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Budgeted URLs
                </div>
                <div className="text-xs bg-gray-50 p-2 rounded border max-h-40 overflow-y-auto">
                  <div className="flex flex-wrap gap-1">
                    {statusData.status.budgetedUrlIds.map((urlId) => (
                      <Badge key={urlId} variant="outline" className="bg-white">
                        URL #{urlId}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            <Separator />
            
            {/* Controls */}
            <div className="flex justify-end gap-2">
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