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
        <CardTitle>Test Spent Value Monitoring</CardTitle>
        <CardDescription>
          This test simulates high spent values to verify that campaigns are paused
          when daily spent exceeds $10. The test runs in simulation mode and doesn't affect real data.
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
                  
                  <div className="font-medium">Paused Due to Spent Value:</div>
                  <div>
                    {result.isPausedDueToSpentValue ? (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                        Yes - High Spent Value
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
                        No
                      </span>
                    )}
                  </div>
                  
                  {result.isPausedDueToSpentValue && result.spentValuePauseInfo && (
                    <>
                      <div className="font-medium">Paused Until:</div>
                      <div>{new Date(result.spentValuePauseInfo.pausedUntil).toLocaleTimeString()}</div>
                      
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