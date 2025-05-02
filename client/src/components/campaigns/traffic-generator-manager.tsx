import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Global Traffic Generator Manager
 * 
 * This component provides a global control panel for the Traffic Generator feature
 * allowing administrators to run the Traffic Generator for all enabled campaigns at once.
 */
export function TrafficGeneratorManager() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  
  // Handler to run Traffic Generator for all campaigns
  const runTrafficGeneratorForAll = async () => {
    try {
      setIsRunning(true);
      
      // Call the API endpoint to run Traffic Generator for all campaigns
      await apiRequest("POST", "/api/traffic-generator/run-all");
      
      // Invalidate any campaign status queries to refresh their data
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === '/api/traffic-generator/status'
      });
      
      toast({
        title: "Traffic Generator Running",
        description: "The Traffic Generator has been triggered for all enabled campaigns.",
      });
    } catch (error) {
      console.error("Error running Traffic Generator for all campaigns:", error);
      
      toast({
        title: "Operation Failed",
        description: "Failed to run Traffic Generator for all campaigns. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <PlayCircle className="mr-2 h-5 w-5 text-primary" />
          Traffic Generator Global Controls
        </CardTitle>
        <CardDescription>
          Run Traffic Generator operations for all enabled campaigns
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Information</AlertTitle>
          <AlertDescription>
            The Traffic Generator automatically runs every 5 minutes, but you can manually trigger it for all campaigns using the button below.
          </AlertDescription>
        </Alert>
        
        <div className="flex justify-end">
          <Button 
            onClick={runTrafficGeneratorForAll} 
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {isRunning ? "Running..." : "Run for All Campaigns"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}