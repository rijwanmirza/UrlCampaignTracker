import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

// Type for URL budget log data
interface UrlBudgetLog {
  urlId: number;
  urlName: string;
  campaignId: number | null;
  price: string;
  dateTime: string;
}

export default function UrlBudgetLogs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch URL budget logs
  const { data, isLoading, isError, error, refetch } = useQuery<{ success: boolean; logs: UrlBudgetLog[] }>({
    queryKey: ["/api/url-budget-logs"],
    retry: 1
  });

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/url-budget-logs/clear', 'POST');
    },
    onSuccess: () => {
      // Invalidate the logs query to refetch
      queryClient.invalidateQueries({ queryKey: ["/api/url-budget-logs"] });
      toast({
        title: "Success",
        description: "URL budget logs cleared successfully",
        variant: "default"
      });
    },
    onError: (error) => {
      console.error("Error clearing URL budget logs:", error);
      toast({
        title: "Error",
        description: "Failed to clear URL budget logs",
        variant: "destructive"
      });
    }
  });

  // Handler for clearing logs
  const handleClearLogs = () => {
    if (confirm("Are you sure you want to clear all URL budget logs? This action cannot be undone.")) {
      clearLogsMutation.mutate();
    }
  };

  // Error handling
  if (isError) {
    console.error("Error fetching URL budget logs:", error);
    toast({
      title: "Error",
      description: "Failed to load URL budget logs",
      variant: "destructive"
    });
  }

  // Format date string for display
  const formatDate = (dateTime: string) => {
    const [date, time] = dateTime.split("::");
    return (
      <div className="flex flex-col">
        <span className="font-medium">{date}</span>
        <span className="text-xs text-gray-500">{time}</span>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">URL Budget Logs</h1>
        {data?.logs && data.logs.length > 0 && (
          <Button 
            variant="destructive" 
            onClick={handleClearLogs}
            disabled={clearLogsMutation.isPending}
            className="flex items-center gap-2"
          >
            {clearLogsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Clear Logs
              </>
            )}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active URL Budget Calculations</CardTitle>
          <CardDescription>
            Log of URL budget calculations for URLs with remaining clicks when a campaign's spent value exceeds $10
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : data?.logs && data.logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL ID</TableHead>
                  <TableHead>URL Name</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((log, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{log.urlId}</TableCell>
                    <TableCell>
                      <Link href={`/detailed-url-record/${log.urlId}`} className="text-blue-600 hover:underline">
                        {log.urlName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {log.campaignId ? (
                        <Link href={`/campaigns/${log.campaignId}`} className="text-blue-600 hover:underline">
                          Campaign #{log.campaignId}
                        </Link>
                      ) : (
                        <Badge variant="outline" className="text-gray-500">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{log.price}</TableCell>
                    <TableCell>{formatDate(log.dateTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center p-8 text-gray-500">
              <p>No URL budget logs found.</p>
              <p className="text-sm mt-2">
                Logs are created when campaigns with spent values exceeding $10 are processed and their remaining URL clicks are calculated.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}