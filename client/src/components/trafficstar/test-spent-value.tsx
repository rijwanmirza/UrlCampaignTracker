import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "../../lib/queryClient";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UrlData {
  activeUrlCount: number;
  pausedUrlCount: number;
  activeClicksRemaining: number;
  wouldActivateByClicks: boolean;
  wouldPauseByClicks: boolean;
}

interface PauseInfo {
  pausedAt: string;
  recheckAt: string;
  minutesRemaining: number;
}

interface TestResult {
  campaignId: number;
  trafficstarId: number;
  currentStatus: string;
  isActive: boolean;
  
  // Spent value data
  dailySpentValue: number;
  spentThresholdExceeded: boolean;
  isPausedDueToSpentValue: boolean;
  spentValuePauseInfo: PauseInfo | null;
  
  // URL and click data
  urlData: UrlData;
  
  // Overall status
  clickThresholdActive: boolean;
  controllingFactor: 'spent_value_threshold' | 'click_threshold_pause' | 'click_threshold_activate' | 'other';
}

export function TestSpentValue() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runTest = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setResults(null);

    try {
      const response = await apiRequest("/api/system/test-spent-value-monitoring", "POST");

      if (response.success) {
        setSuccess("Test completed successfully!");
        setResults(response.results);
      } else {
        setError(response.message || "Unknown error occurred during test");
      }
    } catch (err) {
      setError("Failed to run test: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Campaign Auto-Management Test</CardTitle>
        <CardDescription>
          This comprehensive test verifies both auto-management mechanisms:
          1. Click threshold (activate at 15,000 clicks, pause at 5,000 clicks)
          2. Daily spent value (pause when exceeds $10, overriding click thresholds)
          
          The test runs in simulation mode and won't affect real data or make actual API calls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {results && results.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-medium">Test Results:</h3>
            {results.map((result) => (
              <div 
                key={result.campaignId}
                className="border rounded-md p-4"
              >
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-medium">Campaign ID:</div>
                  <div>{result.campaignId}</div>
                  
                  <div className="font-medium">TrafficStar ID:</div>
                  <div>{result.trafficstarId}</div>
                  
                  <div className="font-medium">Current Status:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {result.currentStatus}
                    </span>
                  </div>
                  
                  <div className="font-medium">Controlling Factor:</div>
                  <div>
                    {result.controllingFactor === 'spent_value_threshold' ? (
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                        Spent Value ($10 Threshold)
                      </span>
                    ) : result.controllingFactor === 'click_threshold_pause' ? (
                      <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
                        Click Threshold (Pause)
                      </span>
                    ) : result.controllingFactor === 'click_threshold_activate' ? (
                      <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                        Click Threshold (Activate)
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                        Other
                      </span>
                    )}
                  </div>
                  
                  <div className="font-medium">Daily Spent Value:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.spentThresholdExceeded ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      ${result.dailySpentValue.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="font-medium">Spent Threshold Exceeded:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.spentThresholdExceeded ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {result.spentThresholdExceeded ? "Yes (> $10)" : "No (< $10)"}
                    </span>
                  </div>
                  
                  <div className="font-medium">Click Threshold Active:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.clickThresholdActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {result.clickThresholdActive ? "Yes" : "No - Overridden by Spent Value"}
                    </span>
                  </div>
                  
                  <div className="font-medium">Active URLs:</div>
                  <div>{result.urlData.activeUrlCount}</div>
                  
                  <div className="font-medium">Paused URLs:</div>
                  <div>{result.urlData.pausedUrlCount}</div>
                  
                  <div className="font-medium">Active Clicks Remaining:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.urlData.activeClicksRemaining >= 15000 
                          ? "bg-green-100 text-green-800" 
                          : result.urlData.activeClicksRemaining <= 5000
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {result.urlData.activeClicksRemaining.toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="font-medium">Would Activate by Clicks:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.urlData.wouldActivateByClicks ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {result.urlData.wouldActivateByClicks ? "Yes (≥ 15,000)" : "No (< 15,000)"}
                    </span>
                  </div>
                  
                  <div className="font-medium">Would Pause by Clicks:</div>
                  <div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.urlData.wouldPauseByClicks ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {result.urlData.wouldPauseByClicks ? "Yes (≤ 5,000)" : "No (> 5,000)"}
                    </span>
                  </div>
                  
                  {result.isPausedDueToSpentValue && result.spentValuePauseInfo && (
                    <>
                      <div className="font-medium">Paused Until:</div>
                      <div>{new Date(result.spentValuePauseInfo.recheckAt).toLocaleTimeString()}</div>
                      
                      <div className="font-medium">Minutes Remaining:</div>
                      <div>
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                          {result.spentValuePauseInfo.minutesRemaining} minutes
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : results && results.length === 0 ? (
          <div className="text-center p-4 text-gray-500">
            No auto-managed campaigns found to test
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={runTest} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Test...
            </>
          ) : (
            "Run Test"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}