import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle, DollarSign, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function TestSpentValueNew() {
  const [isLoading, setIsLoading] = useState(false);
  const [isBudgetUpdateLoading, setIsBudgetUpdateLoading] = useState(false);
  const [isSpentValueLoading, setIsSpentValueLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [spentValueResult, setSpentValueResult] = useState<any | null>(null);
  const [budgetUpdateResult, setBudgetUpdateResult] = useState<any | null>(null);

  const runSpentValueUpdate = async () => {
    setIsSpentValueLoading(true);
    setError(null);
    setSuccess(null);
    setSpentValueResult(null);

    try {
      const response = await fetch("/api/test/trafficstar/update-spent-values", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess("Spent values updated successfully!");
        setSpentValueResult(data);
      } else {
        setError(data.error || "Unknown error occurred");
      }
    } catch (err) {
      setError("Failed to update spent values: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSpentValueLoading(false);
    }
  };
  
  const getSpentValue = async () => {
    if (!campaignId) {
      setError("Please enter a campaign ID");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setSpentValueResult(null);

    try {
      const response = await fetch("/api/test/trafficstar/get-spent-value", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: parseInt(campaignId),
          dateFrom: new Date().toISOString().split('T')[0],
          dateUntil: new Date().toISOString().split('T')[0]
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess("Spent value retrieved successfully!");
        setSpentValueResult(data);
      } else {
        setError(data.error || "Unknown error occurred");
      }
    } catch (err) {
      setError("Failed to get spent value: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };
  
  const updateBudget = async () => {
    if (!campaignId) {
      setError("Please enter a campaign ID");
      return;
    }

    setIsBudgetUpdateLoading(true);
    setError(null);
    setSuccess(null);
    setBudgetUpdateResult(null);

    try {
      const response = await fetch("/api/test/trafficstar/force-budget-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campaignId: parseInt(campaignId)
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess("Budget updated successfully!");
        setBudgetUpdateResult(data);
      } else {
        setError(data.error || "Unknown error occurred");
      }
    } catch (err) {
      setError("Failed to update budget: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsBudgetUpdateLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>TrafficStar Spent Value Testing</CardTitle>
        <CardDescription>
          Test TrafficStar spent value tracking and budget update functionality
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="spent-value" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="spent-value">
              <span className="flex items-center">
                <DollarSign className="w-4 h-4 mr-2" />
                Spent Value
              </span>
            </TabsTrigger>
            <TabsTrigger value="budget-update">
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                Budget Update
              </span>
            </TabsTrigger>
          </TabsList>
          
          {/* Common alert area */}
          <div className="my-4">
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
          </div>
          
          {/* Campaign ID input */}
          <div className="mb-4">
            <Label htmlFor="campaignId">Campaign ID</Label>
            <Input
              id="campaignId"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="mt-1"
              placeholder="Enter campaign ID"
            />
          </div>
          
          {/* TAB 1: Spent Value */}
          <TabsContent value="spent-value" className="pt-4">            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">TrafficStar Spent Value</h3>
              <p className="text-sm text-gray-600 mb-4">
                This section allows you to test the TrafficStar spent value tracking functionality:
                <ol className="list-decimal pl-5 mt-2 space-y-1">
                  <li>Update spent values for all campaigns with TrafficStar integration</li>
                  <li>Get spent value for a specific campaign for today's date</li>
                </ol>
              </p>
              
              <div className="flex flex-col space-y-2">
                <Button 
                  onClick={runSpentValueUpdate} 
                  disabled={isSpentValueLoading}
                  variant="outline"
                >
                  {isSpentValueLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating Spent Values...
                    </>
                  ) : (
                    "Update All Campaign Spent Values"
                  )}
                </Button>
                
                <Button 
                  onClick={getSpentValue} 
                  disabled={isLoading || !campaignId}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Getting Spent Value...
                    </>
                  ) : (
                    "Get Campaign Spent Value"
                  )}
                </Button>
              </div>
            </div>

            {/* Results display for spent value */}
            {spentValueResult && (
              <div className="mt-6 border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">Results:</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
                  {JSON.stringify(spentValueResult, null, 2)}
                </pre>
              </div>
            )}
          </TabsContent>
          
          {/* TAB 2: Budget Update */}
          <TabsContent value="budget-update" className="pt-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">TrafficStar Budget Update</h3>
              <p className="text-sm text-gray-600 mb-4">
                This section allows you to test the budget update functionality:
                <ol className="list-decimal pl-5 mt-2 space-y-1">
                  <li>Update the daily budget for a campaign to $10.15</li>
                  <li>This simulates the automatic budget adjustment that would occur after a spent value threshold pause</li>
                </ol>
              </p>
              
              <Button 
                onClick={updateBudget} 
                disabled={isBudgetUpdateLoading || !campaignId}
                className="w-full"
              >
                {isBudgetUpdateLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Budget...
                  </>
                ) : (
                  "Update Campaign Budget to $10.15"
                )}
              </Button>
            </div>

            {/* Results display for budget update */}
            {budgetUpdateResult && (
              <div className="mt-6 border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">Results:</h3>
                <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
                  {JSON.stringify(budgetUpdateResult, null, 2)}
                </pre>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-xs text-gray-500">
          Note: These operations connect to the TrafficStar API. Please use responsibly.
        </div>
      </CardFooter>
    </Card>
  );
}