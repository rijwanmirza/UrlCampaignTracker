import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface TestResponse {
  success: boolean;
  message: string;
  clicksTracked: number;
  processingTime: string;
}

export function TestUrlBudget() {
  const [campaignId, setCampaignId] = useState("");
  const [urlId, setUrlId] = useState("");
  const [clickValue, setClickValue] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (!campaignId || !urlId) {
      setError("Campaign ID and URL ID are required");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiRequest("/api/system/test-url-budget-update", "POST", {
        campaignId: parseInt(campaignId),
        urlId: parseInt(urlId),
        clickValue: clickValue ? parseInt(clickValue) : undefined,
        immediate
      });

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Test URL Budget Handling</CardTitle>
        <CardDescription>
          This test allows you to verify the URL budget tracking and update functionality.
          It simulates adding a new URL and updating the TrafficStar campaign budget after
          the 10-minute waiting period.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="campaignId">Campaign ID</Label>
              <Input
                id="campaignId"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="Enter campaign ID"
              />
            </div>
            <div>
              <Label htmlFor="urlId">URL ID</Label>
              <Input
                id="urlId"
                value={urlId}
                onChange={(e) => setUrlId(e.target.value)}
                placeholder="Enter URL ID"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="clickValue">Click Value (optional)</Label>
              <Input
                id="clickValue"
                value={clickValue}
                onChange={(e) => setClickValue(e.target.value)}
                placeholder="Leave empty to use URL's click limit"
              />
              <p className="text-xs text-muted-foreground mt-1">
                If not provided, the URL's existing click limit will be used
              </p>
            </div>
            
            <div className="flex items-end">
              <div className="flex items-center space-x-2 mt-6">
                <Checkbox
                  id="immediate"
                  checked={immediate}
                  onCheckedChange={(checked) => setImmediate(checked === true)}
                />
                <Label htmlFor="immediate" className="text-base cursor-pointer">
                  Process immediately (skip 10-minute wait)
                </Label>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>{result.success ? "Success" : "Error"}</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  <p>{result.message}</p>
                  {result.success && (
                    <>
                      <p><strong>Clicks Tracked:</strong> {result.clicksTracked}</p>
                      <p><strong>Processing Time:</strong> {result.processingTime}</p>
                    </>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={runTest} disabled={isLoading} className="w-full">
          {isLoading ? "Running Test..." : "Run URL Budget Test"}
        </Button>
      </CardFooter>
    </Card>
  );
}