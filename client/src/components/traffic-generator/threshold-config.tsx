import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface ThresholdValues {
  minimumClicksThreshold: number;
  remainingClicksThreshold: number;
}

export function ThresholdConfig() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [minimumClicksThreshold, setMinimumClicksThreshold] = useState<number | string>("");
  const [remainingClicksThreshold, setRemainingClicksThreshold] = useState<number | string>("");

  // Fetch the current threshold values when the component mounts
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        setLoading(true);
        const res = await apiRequest("GET", "/api/system/thresholds");
        const data = await res.json();
        
        if (data.minimumClicksThreshold) {
          setMinimumClicksThreshold(data.minimumClicksThreshold);
        }
        
        if (data.remainingClicksThreshold) {
          setRemainingClicksThreshold(data.remainingClicksThreshold);
        }
      } catch (error) {
        console.error("Error fetching threshold values:", error);
        toast({
          title: "Error",
          description: "Failed to load threshold values. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchThresholds();
  }, [toast]);

  const updateThresholdsMutation = useMutation({
    mutationFn: async (values: ThresholdValues) => {
      const res = await apiRequest("POST", "/api/system/thresholds", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/thresholds"] });
      toast({
        title: "Success",
        description: "Threshold values updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update threshold values. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input values
    const minThreshold = Number(minimumClicksThreshold);
    const remainingThreshold = Number(remainingClicksThreshold);
    
    if (isNaN(minThreshold) || minThreshold < 100 || minThreshold > 100000) {
      toast({
        title: "Invalid input",
        description: "Minimum clicks threshold must be between 100 and 100,000",
        variant: "destructive",
      });
      return;
    }
    
    if (isNaN(remainingThreshold) || remainingThreshold < 1000 || remainingThreshold > 1000000) {
      toast({
        title: "Invalid input",
        description: "Remaining clicks threshold must be between 1,000 and 1,000,000",
        variant: "destructive",
      });
      return;
    }
    
    if (minThreshold >= remainingThreshold) {
      toast({
        title: "Invalid configuration",
        description: "Minimum clicks threshold must be less than remaining clicks threshold",
        variant: "destructive",
      });
      return;
    }
    
    updateThresholdsMutation.mutate({
      minimumClicksThreshold: minThreshold,
      remainingClicksThreshold: remainingThreshold,
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Traffic Generator Thresholds</CardTitle>
        <CardDescription>
          Configure the click thresholds used by the Traffic Generator for campaign monitoring
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="minimumClicksThreshold">
                Minimum Clicks Threshold
              </Label>
              <Input
                id="minimumClicksThreshold"
                type="number"
                min={100}
                max={100000}
                value={minimumClicksThreshold}
                onChange={(e) => setMinimumClicksThreshold(e.target.value)}
                placeholder="Default: 5000"
                required
              />
              <p className="text-sm text-muted-foreground">
                When remaining clicks fall below this value, TrafficStar campaigns will be paused
                (default: 5000)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remainingClicksThreshold">
                Remaining Clicks Threshold
              </Label>
              <Input
                id="remainingClicksThreshold"
                type="number"
                min={1000}
                max={1000000}
                value={remainingClicksThreshold}
                onChange={(e) => setRemainingClicksThreshold(e.target.value)}
                placeholder="Default: 15000"
                required
              />
              <p className="text-sm text-muted-foreground">
                A paused campaign will be reactivated when remaining clicks exceed this value
                (default: 15000)
              </p>
            </div>
          </form>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button 
          type="button" 
          onClick={handleSubmit}
          disabled={loading || updateThresholdsMutation.isPending}
        >
          {updateThresholdsMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}