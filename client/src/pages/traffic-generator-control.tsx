import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function TrafficGeneratorControlPage() {
  const [enabled, setEnabled] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const campaignId = 9; // Hardcoded for campaign #9

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/campaigns/${campaignId}`);
        if (!response.ok) {
          throw new Error("Failed to load settings");
        }
        
        const campaign = await response.json();
        setEnabled(campaign.trafficGeneratorEnabled || false);
        setWaitMinutes(campaign.trafficGeneratorWaitMinutes || 5);
      } catch (error) {
        console.error("Error loading settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, [campaignId, toast]);

  // Toggle enabled state
  const handleToggleEnabled = async () => {
    const newValue = !enabled;
    try {
      setIsSaving(true);
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trafficGeneratorEnabled: newValue })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update");
      }
      
      setEnabled(newValue);
      
      toast({
        title: "Success",
        description: `Traffic Generator ${newValue ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error("Error updating enabled state:", error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Increment wait minutes
  const handleIncrement = async () => {
    if (waitMinutes >= 60) return;
    
    const newValue = waitMinutes + 1;
    try {
      setIsSaving(true);
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trafficGeneratorWaitMinutes: newValue })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update");
      }
      
      setWaitMinutes(newValue);
      
      toast({
        title: "Success",
        description: `Wait time set to ${newValue} minutes`,
      });
    } catch (error) {
      console.error("Error updating wait minutes:", error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Decrement wait minutes
  const handleDecrement = async () => {
    if (waitMinutes <= 1) return;
    
    const newValue = waitMinutes - 1;
    try {
      setIsSaving(true);
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trafficGeneratorWaitMinutes: newValue })
      });
      
      if (!response.ok) {
        throw new Error("Failed to update");
      }
      
      setWaitMinutes(newValue);
      
      toast({
        title: "Success",
        description: `Wait time set to ${newValue} minutes`,
      });
    } catch (error) {
      console.error("Error updating wait minutes:", error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Traffic Generator Control Panel</h1>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="ml-2">Loading settings...</span>
        </div>
      ) : (
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Traffic Generator Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Toggle Switch */}
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium">Enable Traffic Generator</h3>
                <p className="text-sm text-muted-foreground">
                  Automatically manage traffic for this campaign
                </p>
              </div>
              <Switch 
                checked={enabled} 
                onCheckedChange={handleToggleEnabled}
                disabled={isSaving}
              />
            </div>
            
            {/* Wait Minutes */}
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Wait Time After Pause</h3>
              <p className="text-sm text-muted-foreground">
                Minutes to wait after pausing a campaign before checking spent value
              </p>
              
              <div className="flex items-center justify-center mt-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-12 rounded-full bg-blue-500 text-white"
                  onClick={handleDecrement}
                  disabled={waitMinutes <= 1 || isSaving}
                >
                  -
                </Button>
                
                <div className="w-20 text-center">
                  <span className="text-2xl font-bold">{waitMinutes}</span>
                  <span className="ml-1 text-sm">min</span>
                </div>
                
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 w-12 rounded-full bg-blue-500 text-white"
                  onClick={handleIncrement}
                  disabled={waitMinutes >= 60 || isSaving}
                >
                  +
                </Button>
              </div>
              
              <div className="text-xs text-center text-muted-foreground mt-2">
                Range: 1-60 minutes
              </div>
            </div>
            
            {/* Status */}
            <div className="pt-4 border-t">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="font-medium">
                  Traffic Generator is {enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              
              {enabled && (
                <p className="text-sm text-muted-foreground mt-1">
                  Will check campaign spent value {waitMinutes} minutes after pausing
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}