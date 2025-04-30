import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useLocation } from "wouter";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardShell } from "@/components/dashboard-shell";
import UrlClickChart from "@/components/url-click-chart";
import { DataTable } from "@/components/ui/data-table";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Search, Calendar as CalendarIcon, ExternalLink, FileText, Link, Hash, FileText as NameIcon, BarChart } from "lucide-react";
import { UrlWithActiveStatus } from "@shared/schema";
import { formatIndianTime } from "@/lib/utils";

// Filter types with expanded options as requested
type FilterType = 
  "today" | 
  "yesterday" | 
  "last_2_days" | 
  "last_3_days" | 
  "last_4_days" | 
  "last_5_days" | 
  "last_6_days" | 
  "last_7_days" | 
  "this_month" | 
  "last_month" | 
  "all_time" |
  "custom_range";

// Column definition for the data table to display every URL record
const columns = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }: any) => {
      return <span className="font-mono text-xs">{row.getValue("id")}</span>;
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }: any) => {
      return <span className="font-medium">{row.getValue("name")}</span>;
    },
  },
  {
    accessorKey: "targetUrl",
    header: "URL",
    cell: ({ row }: any) => {
      const url = row.getValue("targetUrl");
      return (
        <div className="flex items-center space-x-1 max-w-[200px]">
          <span className="truncate">{url}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </a>
        </div>
      );
    },
  },
  {
    accessorKey: "clicks",
    header: "Click Quantity",
    cell: ({ row }: any) => {
      const clicks = row.getValue("clicks");
      const filteredClicks = row.original.filteredClicks || 0;
      
      // Show both total clicks and filtered clicks for the selected time period
      return (
        <div className="flex flex-col">
          <span className="font-medium">{filteredClicks}</span>
          <span className="text-xs text-muted-foreground">Total: {clicks}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }: any) => {
      const status = row.getValue("status");
      return (
        <Badge
          variant={
            status === 'active' 
              ? 'default' 
              : status === 'paused' 
                ? 'outline' 
                : status === 'deleted' 
                  ? 'destructive' 
                  : 'secondary'
          }
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      );
    },
  },
  {
    accessorKey: "logs",
    header: "Logs",
    cell: ({ row }: any) => {
      // Button to view logs for this URL
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              <span>View Logs</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Click Logs for URL: {row.getValue("name")}</DialogTitle>
            </DialogHeader>
            <div className="p-4 bg-muted/50 rounded-md font-mono text-xs overflow-x-auto whitespace-pre">
              {/* We would use an API endpoint to fetch the raw logs for this URL */}
              <UrlClickLogs urlId={row.getValue("id")} />
            </div>
          </DialogContent>
        </Dialog>
      );
    },
  },
  {
    accessorKey: "analytics",
    header: "Action",
    cell: ({ row }: any) => {
      // Extract the navigation function from wouter
      const [, navigate] = useLocation();
      
      // Button to view detailed analytics for this URL
      return (
        <Button 
          variant="default" 
          size="sm" 
          className="flex items-center gap-1"
          onClick={() => navigate(`/detailed-url-record/${row.getValue("id")}`)}
        >
          <BarChart className="h-3.5 w-3.5" />
          <span>Analytics</span>
        </Button>
      );
    },
  },
];

// Component to display raw logs for a URL
function UrlClickLogs({ urlId }: { urlId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/url-click-records/raw/${urlId}`, urlId],
    queryFn: async () => {
      const response = await fetch(`/api/url-click-records/raw/${urlId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch URL logs");
      }
      return await response.json();
    },
  });

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (error) {
    return <div className="text-red-500">Error loading logs: {(error as Error).message}</div>;
  }

  if (!data?.rawLogs?.length) {
    return <div className="text-muted-foreground">No logs available for this URL.</div>;
  }

  return (
    <div>
      {data.rawLogs.map((log: string, index: number) => (
        <div key={index} className="py-1 border-b border-border last:border-0">
          {log}
        </div>
      ))}
    </div>
  );
}

export default function UrlClickRecordsPage() {
  const [filter, setFilter] = useState<FilterType>("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(20);
  
  // Construct query parameters based on filter settings
  const queryParams: Record<string, string> = {
    filterType: filter,
    page: currentPage.toString(),
    limit: recordsPerPage.toString(),
    timezone: "Asia/Kolkata", // Indian timezone for all filters
  };
  
  if (searchTerm) {
    queryParams.search = searchTerm;
  }
  
  if (filter === 'custom_range' && startDate && endDate) {
    queryParams.startDate = format(startDate, 'yyyy-MM-dd');
    queryParams.endDate = format(endDate, 'yyyy-MM-dd');
  }
  
  // Fetch all URLs to display in the table
  const { data: urlsData, isLoading: loadingUrls } = useQuery({
    queryKey: ['/api/urls'],
    queryFn: async () => {
      const response = await fetch('/api/urls');
      if (!response.ok) throw new Error('Failed to fetch URLs');
      return response.json();
    },
  });
  
  // Fetch URL click summary data for the selected period
  const { 
    data: clickData, 
    isLoading: loadingClicks, 
    error: clickError,
    refetch: refetchClickData
  } = useQuery({
    queryKey: ['/api/url-click-records/summary', queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/api/url-click-records/summary?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch URL click records summary');
      }
      
      return response.json();
    },
  });
  
  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);
  
  // Combined data for display - merge URLs with their click counts for the filtered period
  const combinedData = useMemo(() => {
    // To debug what data we're getting
    console.log("URLs data:", urlsData);
    console.log("Click data:", clickData);
    
    if (!urlsData?.urls?.length) return [];
    
    return urlsData.urls.map((url: UrlWithActiveStatus) => {
      // Find this URL's click count in the filtered data
      const urlClickData = clickData?.urlBreakdown?.find((item: any) => item.urlId === url.id);
      
      return {
        ...url,
        filteredClicks: urlClickData?.clicks || 0
      };
    }).filter((url: any) => {
      // Apply search filter
      if (!searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      return (
        url.id.toString().includes(searchLower) ||
        url.name.toLowerCase().includes(searchLower) ||
        url.targetUrl.toLowerCase().includes(searchLower)
      );
    });
  }, [urlsData, clickData, searchTerm]);
  
  // Get chart data for visualization
  const chartData = useMemo(() => {
    if (!clickData?.dailyBreakdown) return [];
    
    // Convert the dailyBreakdown object to an array of { name, value } objects
    return Object.entries(clickData.dailyBreakdown).map(([date, clicks]) => ({
      name: date,
      value: Number(clicks)
    }));
  }, [clickData]);
  
  // Get the human-readable filter description
  const getFilterDescription = () => {
    switch (filter) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "last_2_days":
        return "Last 2 days";
      case "last_3_days":
        return "Last 3 days";
      case "last_4_days":
        return "Last 4 days";
      case "last_5_days":
        return "Last 5 days";
      case "last_6_days":
        return "Last 6 days";
      case "last_7_days":
        return "Last 7 days";
      case "this_month":
        return "This month";
      case "last_month":
        return "Last month";
      case "custom_range":
        return startDate && endDate
          ? `${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}`
          : "Custom range";
      case "all_time":
        return "All time";
      default:
        return "URL clicks";
    }
  };
  
  // Handle pagination for the data table
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return combinedData.slice(startIndex, startIndex + recordsPerPage);
  }, [combinedData, currentPage, recordsPerPage]);
  
  const totalPages = Math.ceil(combinedData.length / recordsPerPage);
  
  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };
  
  return (
    <DashboardShell>
      <DashboardHeader
        heading="URL Click Records"
        description="View and analyze URL click data with Indian timezone (UTC+5:30)"
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetchClickData()}
          >
            Refresh
          </Button>
        </div>
      </DashboardHeader>
      
      {/* Filter and search controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>
            Find URLs by ID, Name or URL address
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            {/* Search box with visual indicators for searchable fields */}
            <div className="flex-1 w-full md:w-auto">
              <div className="flex w-full items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search" 
                    placeholder="Search URLs by ID, name or URL..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={handleSearch}
                  />
                </div>
              </div>
              <div className="text-xs flex items-center gap-6 text-muted-foreground mt-2">
                <div className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  <span>ID</span>
                </div>
                <div className="flex items-center gap-1">
                  <NameIcon className="h-3 w-3" />
                  <span>Name</span>
                </div>
                <div className="flex items-center gap-1">
                  <Link className="h-3 w-3" />
                  <span>URL Address</span>
                </div>
              </div>
            </div>
            
            {/* Date filter selector */}
            <div className="w-full md:w-auto">
              <Select
                value={filter}
                onValueChange={(value: FilterType) => setFilter(value as FilterType)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select time period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last_2_days">Last 2 days</SelectItem>
                  <SelectItem value="last_3_days">Last 3 days</SelectItem>
                  <SelectItem value="last_4_days">Last 4 days</SelectItem>
                  <SelectItem value="last_5_days">Last 5 days</SelectItem>
                  <SelectItem value="last_6_days">Last 6 days</SelectItem>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                  <SelectItem value="custom_range">Custom date range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Custom date range picker, only shown when custom range is selected */}
            {filter === 'custom_range' && (
              <div className="flex items-center space-x-2">
                <div className="grid gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date-from"
                        variant={"outline"}
                        className="w-[150px] justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "From date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date-to"
                        variant={"outline"}
                        className="w-[150px] justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "To date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Click summary chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL Click Summary: {getFilterDescription()}</CardTitle>
          <CardDescription>
            Total clicks for this period: {clickData?.totalClicks || 0}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingClicks ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : chartData.length > 0 ? (
            <UrlClickChart data={chartData} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No click data available for the selected period.
            </div>
          )}
        </CardContent>
      </Card>

      {/* URL records table */}
      <Card>
        <CardHeader>
          <CardTitle>URL Records</CardTitle>
          <CardDescription>
            All URLs with click counts for {getFilterDescription()} | Searchable by ID, Name, and URL
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingUrls ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : paginatedData.length > 0 ? (
            <>
              <DataTable columns={columns} data={paginatedData} />
              
              {/* Pagination controls */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, combinedData.length)} of {combinedData.length} URLs
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages || 1}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No URL records found matching your search criteria.
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}