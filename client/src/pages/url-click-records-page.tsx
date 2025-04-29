import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, FileBarChart, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardShell } from "@/components/dashboard-shell";
import { queryClient } from "@/lib/queryClient";
import UrlClickChart from "@/components/url-click-chart";

export default function UrlClickRecordsPage() {
  const { toast } = useToast();
  const [urlId, setUrlId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string>("today");
  const [showHourly, setShowHourly] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  // Generate a timestamp for cache-busting
  const timestamp = Date.now();

  // Get URLs for the dropdown
  const { data: urlsData, isLoading: urlsLoading } = useQuery({
    queryKey: ["/api/urls", "all", { page: 1, limit: 1000 }],
    queryFn: async () => {
      const res = await fetch(`/api/urls/all?page=1&limit=1000`);
      if (!res.ok) throw new Error("Failed to fetch URLs");
      return res.json();
    },
  });

  // Get URL click summary data
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: [
      "/api/url-click-records/summary",
      urlId,
      filterType,
      showHourly,
      startDate,
      endDate,
      timestamp
    ],
    queryFn: async () => {
      if (!urlId) return null;
      
      let url = `/api/url-click-records/summary/${urlId}?filterType=${filterType}&showHourly=${showHourly}&_timestamp=${timestamp}`;
      
      if (filterType === "custom_range" && startDate && endDate) {
        url += `&startDate=${format(startDate, "yyyy-MM-dd")}&endDate=${format(endDate, "yyyy-MM-dd")}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch summary data");
      return res.json();
    },
    enabled: !!urlId,
    retry: 1,
  });

  // Get detailed click records
  const { data: recordsData, isLoading: recordsLoading, refetch: refetchRecords } = useQuery({
    queryKey: [
      "/api/url-click-records",
      urlId,
      page,
      filterType,
      startDate,
      endDate,
      timestamp
    ],
    queryFn: async () => {
      if (!urlId) return null;
      
      let url = `/api/url-click-records?page=${page}&limit=10&urlId=${urlId}&filterType=${filterType}&_timestamp=${timestamp}`;
      
      if (filterType === "custom_range" && startDate && endDate) {
        url += `&startDate=${format(startDate, "yyyy-MM-dd")}&endDate=${format(endDate, "yyyy-MM-dd")}`;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch records");
      return res.json();
    },
    enabled: !!urlId,
    retry: 1,
  });

  // Function to refresh data
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["/api/url-click-records/summary", urlId],
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/url-click-records", urlId],
    });
    refetchSummary();
    refetchRecords();
    
    toast({
      title: "Data refreshed",
      description: "URL click records have been refreshed.",
    });
  }, [urlId, refetchSummary, refetchRecords, toast]);

  // Function to generate test data
  const generateTestData = async () => {
    if (!urlId) {
      toast({
        title: "URL required",
        description: "Please select a URL first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/url-click-records/generate-specific-test-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urlId,
          clicksPerDay: 20,
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate test data");
      }
      
      const data = await res.json();
      
      toast({
        title: "Test data generated",
        description: `Generated ${data.counts.total} clicks across different time periods.`,
      });
      
      // Refresh data after generating test data
      refreshData();
    } catch (error) {
      console.error("Error generating test data:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate test data",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardShell>
      <DashboardHeader
        heading="URL Click Records"
        description="View detailed click records for individual URLs"
      >
        <Button
          onClick={refreshData}
          variant="outline"
          size="sm"
          className="h-8 gap-1"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </DashboardHeader>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>URL Click Analytics</CardTitle>
            <CardDescription>
              Select a URL and time range to view detailed click statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Select URL</label>
                <Select
                  value={urlId}
                  onValueChange={(value) => {
                    setUrlId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a URL" />
                  </SelectTrigger>
                  <SelectContent>
                    {urlsLoading ? (
                      <div className="p-2">Loading URLs...</div>
                    ) : urlsData?.urls && urlsData.urls.length > 0 ? (
                      urlsData.urls.map((url: any) => (
                        <SelectItem key={url.id} value={url.id.toString()}>
                          {url.name} - {url.targetUrl.substring(0, 20)}...
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2">No URLs available</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Filter</label>
                <Select
                  value={filterType}
                  onValueChange={(value) => {
                    setFilterType(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last_2_days">Last 2 Days</SelectItem>
                    <SelectItem value="last_3_days">Last 3 Days</SelectItem>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="last_year">Last Year</SelectItem>
                    <SelectItem value="total">All Time</SelectItem>
                    <SelectItem value="custom_range">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Show Hourly Breakdown
                </label>
                <Select
                  value={showHourly ? "true" : "false"}
                  onValueChange={(value) => setShowHourly(value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Show hourly data" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {filterType === "custom_range" && (
              <div className="grid gap-4 md:grid-cols-2 mt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={(date) =>
                          (startDate ? date < startDate : false)
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-between">
              <Button
                onClick={generateTestData}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <FileBarChart className="h-3.5 w-3.5" />
                Generate Test Data
              </Button>
              
              {(filterType === "custom_range" && (!startDate || !endDate)) && (
                <p className="text-sm text-orange-500">
                  Please select both start and end dates for custom range
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {urlId ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>URL Click Summary</CardTitle>
              <CardDescription>
                {summaryData?.filterInfo?.dateRange || "Loading date range..."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : summaryData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Total Clicks</p>
                      <h3 className="text-3xl font-bold">
                        {summaryData.totalClicks || 0}
                      </h3>
                    </div>
                  </div>
                  
                  <Tabs defaultValue={showHourly ? "hourly" : "daily"}>
                    <TabsList>
                      <TabsTrigger value="hourly" disabled={!showHourly}>
                        Hourly Breakdown
                      </TabsTrigger>
                      <TabsTrigger value="daily">
                        Daily Breakdown
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="hourly">
                      {summaryData.hourlyBreakdown ? (
                        <UrlClickChart
                          data={summaryData.hourlyBreakdown.map((item: any) => ({
                            name: `${item.hour}:00`,
                            value: item.clicks,
                          }))}
                          xAxisLabel="Hour of Day"
                          yAxisLabel="Clicks"
                        />
                      ) : (
                        <p className="py-4 text-center text-muted-foreground">
                          No hourly data available for this period
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="daily">
                      {summaryData.dailyBreakdown &&
                      Object.keys(summaryData.dailyBreakdown).length > 0 ? (
                        <UrlClickChart
                          data={Object.entries(summaryData.dailyBreakdown).map(
                            ([date, clicks]: [string, any]) => ({
                              name: date,
                              value: clicks,
                            })
                          )}
                          xAxisLabel="Date"
                          yAxisLabel="Clicks"
                        />
                      ) : (
                        <p className="py-4 text-center text-muted-foreground">
                          No daily data available for this period
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <p className="py-4 text-center text-muted-foreground">
                  No summary data available. Select a URL to view statistics.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Click Records</CardTitle>
              <CardDescription>
                Individual click records for the selected URL and filter
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recordsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recordsData?.records && recordsData.records.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-md border">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            ID
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            Timestamp
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            URL
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-background">
                        {recordsData.records.map((record: any) => (
                          <tr key={record.id}>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              {record.id}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              {new Date(record.click_time || record.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {record.url?.name || record.urlName || "Unknown"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing page {page} of{" "}
                      {Math.max(1, Math.ceil(recordsData.total / 10))}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={
                          page >= Math.ceil(recordsData.total / 10) || recordsData.total === 0
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-muted-foreground">
                  No click records found for the selected URL and filter.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="col-span-full">
          <CardContent className="flex min-h-[200px] flex-col items-center justify-center space-y-4 p-8 text-center">
            <FileBarChart className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-xl font-medium">No URL Selected</h3>
              <p className="text-muted-foreground">
                Select a URL to view detailed click statistics and records.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}