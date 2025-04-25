import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function ErrorLogList() {
  const { toast } = useToast();
  const [page, setPage] = React.useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/logs/trafficstar-errors", page],
    queryFn: async () => {
      const response = await fetch(`/api/logs/trafficstar-errors?page=${page}&limit=10`);
      if (!response.ok) {
        throw new Error("Failed to fetch error logs");
      }
      return response.json();
    }
  });

  const markAsResolved = async (id: number) => {
    try {
      await apiRequest(`/api/logs/trafficstar-errors/${id}/resolve`, "POST");
      toast({
        title: "Success",
        description: "Error log marked as resolved",
        variant: "default",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark error log as resolved",
        variant: "destructive",
      });
    }
  };

  const clearResolved = async () => {
    try {
      await apiRequest("/api/logs/trafficstar-errors/resolved", "DELETE");
      toast({
        title: "Success",
        description: "Resolved error logs cleared",
        variant: "default",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear resolved error logs",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatJson = (json: any) => {
    if (!json) return "N/A";
    if (typeof json === "string") {
      try {
        return JSON.stringify(JSON.parse(json), null, 2);
      } catch {
        return json;
      }
    }
    return JSON.stringify(json, null, 2);
  };

  if (isLoading) {
    return <div>Loading error logs...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>API Error Logs</CardTitle>
        <Button onClick={clearResolved} variant="outline">
          Clear Resolved
        </Button>
      </CardHeader>
      <CardContent>
        {data?.logs && data.logs.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDate(log.createdAt)}</TableCell>
                    <TableCell>{log.actionType}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">
                        {log.method} {log.endpoint}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span title={log.errorDetails ? formatJson(log.errorDetails) : ""}>
                        {log.errorMessage}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.resolved ? (
                        <Badge variant="outline" className="bg-green-50">Resolved</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50">Unresolved</Badge>
                      )}
                    </TableCell>
                    <TableCell>{log.retryCount}</TableCell>
                    <TableCell>
                      {!log.resolved && (
                        <Button
                          onClick={() => markAsResolved(log.id)}
                          variant="outline"
                          size="sm"
                        >
                          Mark Resolved
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between items-center mt-4">
              <Button
                onClick={() => setPage(page => Math.max(page - 1, 1))}
                disabled={page === 1}
                variant="outline"
              >
                Previous
              </Button>
              <span>
                Page {page} of {data.pagination?.totalPages || 1}
              </span>
              <Button
                onClick={() => 
                  setPage(page => 
                    page < (data.pagination?.totalPages || 1) ? page + 1 : page
                  )
                }
                disabled={page >= (data.pagination?.totalPages || 1)}
                variant="outline"
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">No error logs found</div>
        )}
      </CardContent>
    </Card>
  );
}