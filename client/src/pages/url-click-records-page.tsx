import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardShell } from "@/components/dashboard-shell";
import UrlClickChart from "@/components/url-click-chart";
import { DataTable } from "@/components/ui/data-table";
import { Loader2 } from "lucide-react";

// Filter types
type FilterType = "today" | "yesterday" | "last7days" | "last30days" | "thisMonth" | "lastMonth" | "all";

// Column definition for the data table
const columns = [
  {
    accessorKey: "url_id",
    header: "URL ID",
  },
  {
    accessorKey: "url",
    header: "URL",
  },
  {
    accessorKey: "click_time",
    header: "Click Time",
    cell: ({ row }: any) => {
      const time = row.getValue("click_time");
      return format(new Date(time), "yyyy-MM-dd HH:mm:ss");
    },
  },
  {
    accessorKey: "campaign_id",
    header: "Campaign ID",
  },
];

export default function UrlClickRecordsPage() {
  const [filter, setFilter] = useState<FilterType>("today");
  
  // Fetch URL click records with the selected filter
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/url-click-records", filter, Date.now()], // Add timestamp to avoid caching
    queryFn: async () => {
      const response = await fetch(`/api/url-click-records?filter=${filter}`);
      if (!response.ok) {
        throw new Error("Failed to fetch URL click records");
      }
      return await response.json();
    },
  });

  // Get summary data for the chart
  const chartData = useMemo(() => {
    if (!data?.summary) return [];
    return data.summary.map((item: any) => ({
      name: item.date,
      value: item.count
    }));
  }, [data]);

  // Get the human-readable filter description
  const getFilterDescription = () => {
    switch (filter) {
      case "today":
        return "Today's clicks";
      case "yesterday":
        return "Yesterday's clicks";
      case "last7days":
        return "Clicks from the last 7 days";
      case "last30days":
        return "Clicks from the last 30 days";
      case "thisMonth":
        return "Clicks from this month";
      case "lastMonth":
        return "Clicks from last month";
      case "all":
        return "All clicks";
      default:
        return "URL clicks";
    }
  };

  return (
    <DashboardShell>
      <DashboardHeader
        heading="URL Click Records"
        description="View and analyze URL click data"
      >
        <div className="flex items-center gap-2">
          <Select
            value={filter}
            onValueChange={(value: FilterType) => setFilter(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7days">Last 7 days</SelectItem>
              <SelectItem value="last30days">Last 30 days</SelectItem>
              <SelectItem value="thisMonth">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            onClick={() => {
              // Force refetch with a new timestamp in the queryKey
              setFilter(filter);
            }}
          >
            Refresh
          </Button>
        </div>
      </DashboardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-500">
              Error loading URL click data. Please try again.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>URL Click Summary: {getFilterDescription()}</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.summary?.length > 0 ? (
                <UrlClickChart data={chartData} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No click data available for the selected period.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Detailed URL Click Records</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.records?.length > 0 ? (
                  <DataTable columns={columns} data={data.records} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No URL click records found for the selected period.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}