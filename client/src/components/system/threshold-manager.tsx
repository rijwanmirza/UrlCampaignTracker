import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function ThresholdManager() {
  const [minimumClicksThreshold, setMinimumClicksThreshold] = useState<string>("5000");
  const [remainingClicksThreshold, setRemainingClicksThreshold] = useState<string>("15000");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const response = await fetch("/api/system/thresholds");
        if (response.ok) {
          const data = await response.json();
          setMinimumClicksThreshold(data.minimumClicksThreshold);
          setRemainingClicksThreshold(data.remainingClicksThreshold);
        } else {
          // If the settings don't exist yet, we'll keep the default values
          console.warn("Could not fetch thresholds, using defaults");
        }
      } catch (error) {
        console.error("Error fetching thresholds:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchThresholds();
  }, []);

  const saveThresholds = async () => {
    try {
      setIsSaving(true);
      
      // Validate inputs (must be positive integers)
      const minClicks = parseInt(minimumClicksThreshold);
      const remainingClicks = parseInt(remainingClicksThreshold);
      
      if (isNaN(minClicks) || minClicks <= 0) {
        toast({
          title: "Invalid Minimum Clicks Threshold",
          description: "Please enter a positive number for the minimum clicks threshold.",
          variant: "destructive",
        });
        return;
      }
      
      if (isNaN(remainingClicks) || remainingClicks <= 0) {
        toast({
          title: "Invalid Remaining Clicks Threshold",
          description: "Please enter a positive number for the remaining clicks threshold.",
          variant: "destructive",
        });
        return;
      }
      
      // Ensure remaining clicks threshold is greater than minimum clicks threshold
      if (remainingClicks <= minClicks) {
        toast({
          title: "Invalid Threshold Values",
          description: "Remaining clicks threshold must be greater than minimum clicks threshold.",
          variant: "destructive",
        });
        return;
      }
      
      const response = await fetch("/api/system/thresholds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          minimumClicksThreshold: minClicks,
          remainingClicksThreshold: remainingClicks,
        }),
      });

      if (response.ok) {
        toast({
          title: "Thresholds Updated",
          description: "Traffic generator thresholds have been updated successfully.",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update thresholds");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Traffic Generator Thresholds</CardTitle>
          <CardDescription>Loading thresholds...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Traffic Generator Thresholds</CardTitle>
        <CardDescription>
          Configure the threshold values used for auto-pausing and auto-activating campaigns 
          based on remaining clicks. Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="minimumClicksThreshold">
              Minimum Clicks Threshold (Auto-Pause)
            </Label>
            <Input
              id="minimumClicksThreshold"
              value={minimumClicksThreshold}
              onChange={(e) => setMinimumClicksThreshold(e.target.value)}
              className="mt-1"
              type="number"
              min="1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              When remaining clicks drop below this value, campaigns will be automatically paused.
              Current value: {minimumClicksThreshold}
            </p>
          </div>
          
          <div>
            <Label htmlFor="remainingClicksThreshold">
              Remaining Clicks Threshold (Auto-Activate)
            </Label>
            <Input
              id="remainingClicksThreshold"
              value={remainingClicksThreshold}
              onChange={(e) => setRemainingClicksThreshold(e.target.value)}
              className="mt-1"
              type="number"
              min="1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Campaigns will be auto-activated when remaining clicks exceed this value.
              Current value: {remainingClicksThreshold}
            </p>
          </div>
        </div>
        
        <Button 
          className="mt-4" 
          onClick={saveThresholds}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Thresholds"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}