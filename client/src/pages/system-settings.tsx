import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import DecimalMultiplierMigration from "@/components/system/decimal-multiplier-migration";
import TrafficSenderMigration from "@/components/system/traffic-sender-migration";
import ApiKeyManager from "@/components/system/api-key-manager";
import { ServerMonitor } from "@/components/server-monitor/server-stats";
import AccessCodeManager from "@/components/system/access-code-manager";

export default function SystemSettings() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const handleCleanup = async () => {
    if (confirmText !== "DELETE ALL DATA") {
      toast({
        title: "Confirmation Failed",
        description: "Please type the exact confirmation phrase.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsDeleting(true);
      
      const response = await fetch("/api/system/full-cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmText }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const result = data.result;
        const deletedItems = [
          `${result.campaignsDeleted} campaigns`,
          `${result.urlsDeleted} URLs`,
          `${result.originalUrlRecordsDeleted} original URL records`,
          `${result.youtubeUrlRecordsDeleted || 0} YouTube URL records`,
          `${result.trafficstarCampaignsDeleted || 0} TrafficStar campaigns`,
          `${result.urlBudgetLogsDeleted || 0} URL budget logs`,
          `${result.urlClickRecordsDeleted || 0} URL click records`,
          `${result.urlClickLogsDeleted || 0} URL click logs`,
          `${result.campaignClickRecordsDeleted || 0} campaign click records`
        ].join(', ');
        
        toast({
          title: "System Cleanup Complete",
          description: `Successfully deleted: ${deletedItems}`,
        });
        
        // Close the dialog and clear the input
        setIsDialogOpen(false);
        setConfirmText("");
      } else {
        const error = await response.json();
        toast({
          title: "Cleanup Failed",
          description: error.message || "System cleanup failed. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">System Settings</h1>
        <p className="text-muted-foreground mt-2">
          Advanced settings and maintenance tools for the application
        </p>
      </div>
      
      {/* Server Monitoring section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">Server Monitoring</h2>
        <ServerMonitor />
      </div>
      
      {/* API Key Management section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">Security Settings</h2>
        <ApiKeyManager />
        <AccessCodeManager />
      </div>
      
      {/* Migration section */}
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4">Database Migrations</h2>
        <DecimalMultiplierMigration />
        <TrafficSenderMigration />
      </div>
      
      {/* System cleanup section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">System Cleanup</h2>
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">
              Delete All Data
            </CardTitle>
            <CardDescription>
              Permanently delete all campaigns, URLs, and email logs from the system.
              This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Full System Cleanup
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will permanently delete all campaigns, URLs, and email logs.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                
                <div className="mt-4 mb-2">
                  <Label htmlFor="confirm" className="font-bold">
                    Type "DELETE ALL DATA" to confirm:
                  </Label>
                  <Input
                    id="confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="mt-2"
                    placeholder="DELETE ALL DATA"
                  />
                </div>
                
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleCleanup();
                    }}
                    disabled={isDeleting || confirmText !== "DELETE ALL DATA"}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete All Data"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}