import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link as WouterLink } from "wouter";
import { format, subDays, parseISO, startOfDay, endOfDay, differenceInDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardShell } from "@/components/dashboard-shell";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Calendar as CalendarIcon, ChevronLeft, ExternalLink, Clock } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
  "this_year" | 
  "last_year" |
  "all_time" |
  "custom_range";

// View types for displaying data
type ViewType = "daily" | "hourly";

export default function DetailedUrlRecordPage() {
  const { urlId } = useParams();
  const id = parseInt(urlId || "0");
  
  const [filter, setFilter] = useState<FilterType>("today");
  const [viewType, setViewType] = useState<ViewType>("daily");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  
  // Add timezone selection with appropriate labeling for IST (GMT+5:30)
  const [timezone, setTimezone] = useState<"Asia/Kolkata" | "UTC">("Asia/Kolkata");
  
  // Get timezone display label
  const getTimezoneLabel = () => {
    return timezone === "Asia/Kolkata" ? "IST (GMT+5:30)" : "UTC (GMT+0:00)";
  };
  
  // Construct query parameters based on filter settings
  const queryParams: Record<string, string> = {
    filterType: filter,
    timezone: timezone, // Allow switching between Indian and UTC timezone
  };
  
  if (filter === 'custom_range' && startDate && endDate) {
    queryParams.startDate = format(startDate, 'yyyy-MM-dd');
    queryParams.endDate = format(endDate, 'yyyy-MM-dd');
  }
  
  // Fetch the specific URL details
  const { data: urlData, isLoading: loadingUrl } = useQuery({
    queryKey: [`/api/urls/${id}`],
    queryFn: async () => {
      console.log(`Fetching URL details for ID: ${id}`);
      const response = await fetch(`/api/urls/${id}`);
      
      // Log the response details for debugging
      console.log(`URL details response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch URL details:', errorText);
        throw new Error(`Failed to fetch URL details: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('URL data received:', data);
      return data;
    },
    retry: 3,
    retryDelay: 1000,
  });
  
  // Fetch URL click data for the selected period including hourly breakdown
  const { 
    data: clickData, 
    isLoading: loadingClicks,
    refetch: refetchClickData
  } = useQuery({
    queryKey: [`/api/url-click-records/${id}`, queryParams],
    queryFn: async () => {
      console.log(`Fetching click data for URL ID: ${id} with params:`, queryParams);
      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/api/url-click-records/${id}?${params.toString()}`);
      
      // Log the response details for debugging
      console.log(`Click data response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch URL click details:', errorText);
        throw new Error(`Failed to fetch URL click details: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Click data received:', data);
      return data;
    },
    retry: 3,
    retryDelay: 1000,
    enabled: !!urlData, // Only run this query when URL data is available
  });
  
  // Format the chart data based on view type (daily or hourly)
  const chartData = useMemo(() => {
    if (!clickData) return [];
    
    if (viewType === "daily") {
      if (!clickData.dailyBreakdown) return [];
      
      // Convert the dailyBreakdown object to an array of { name, value } objects
      return Object.entries(clickData.dailyBreakdown).map(([date, clicks]) => ({
        name: date,
        value: Number(clicks)
      })).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
    } else {
      // Check if we have the new hourlyByDate format
      if (clickData.hourlyByDate) {
        // Select the first date's hourly data (or all dates for multi-day view)
        // We'll handle the full display in the render part
        const firstDateKey = Object.keys(clickData.hourlyByDate)[0];
        if (firstDateKey && clickData.hourlyByDate[firstDateKey]) {
          return Object.entries(clickData.hourlyByDate[firstDateKey]).map(([hour, clicks]) => ({
            name: hour,
            value: Number(clicks)
          })).sort((a, b) => {
            const hourA = parseInt(a.name.split(':')[0]);
            const hourB = parseInt(b.name.split(':')[0]);
            return hourA - hourB;
          });
        }
      }
      
      // Fallback to the original hourlyBreakdown for backward compatibility
      if (!clickData.hourlyBreakdown) return [];
      
      // Convert the hourlyBreakdown object to chart-friendly format
      return Object.entries(clickData.hourlyBreakdown).map(([hour, clicks]) => {
        const hourInt = parseInt(hour);
        const formattedHour = `${hourInt.toString().padStart(2, '0')}:00`;
        return {
          name: formattedHour,
          value: Number(clicks)
        };
      }).sort((a, b) => {
        const hourA = parseInt(a.name.split(':')[0]);
        const hourB = parseInt(b.name.split(':')[0]);
        return hourA - hourB;
      });
    }
  }, [clickData, viewType]);
  
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
      case "this_year":
        return "This year";
      case "last_year":
        return "Last year";
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
  
  // Handle loading states
  if (loadingUrl || !urlData) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }
  
  return (
    <DashboardShell>
      <DashboardHeader
        heading={`URL Analytics: ${urlData.name}`}
        description={`Detailed click analysis with ${timezone === "Asia/Kolkata" ? "Indian" : "UTC"} timezone (${getTimezoneLabel()})`}
      >
        <div className="flex items-center gap-2">
          <WouterLink href="/url-click-records">
            <Button
              variant="outline"
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to All URLs</span>
            </Button>
          </WouterLink>
          
          <Button
            variant="outline"
            onClick={() => refetchClickData()}
          >
            Refresh
          </Button>
        </div>
      </DashboardHeader>
      
      {/* URL Info Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">ID</h3>
              <p className="text-lg font-mono">{urlData.id}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Name</h3>
              <p className="text-lg">{urlData.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Target URL</h3>
              <div className="flex items-center gap-2">
                <p className="text-lg break-all">{urlData.targetUrl}</p>
                <a href={urlData.targetUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground flex-shrink-0" />
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Total Clicks</h3>
              <p className="text-lg font-semibold">{urlData.clicks}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Filter Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtering Options</CardTitle>
          <CardDescription>
            Select a time period to analyze click data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
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
                  <SelectItem value="this_year">This year</SelectItem>
                  <SelectItem value="last_year">Last year</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                  <SelectItem value="custom_range">Custom date range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* View Type Selector */}
            <div className="w-full md:w-auto">
              <Select
                value={viewType}
                onValueChange={(value: ViewType) => setViewType(value as ViewType)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select view type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily View</SelectItem>
                  <SelectItem value="hourly">Hourly Breakdown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Timezone Selector */}
            <div className="w-full md:w-auto">
              <Select
                value={timezone}
                onValueChange={(value: "Asia/Kolkata" | "UTC") => setTimezone(value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Indian Time (IST/GMT+5:30)</SelectItem>
                  <SelectItem value="UTC">UTC/GMT+0:00</SelectItem>
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
      
      {/* Click data visualization */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <span>{viewType === 'daily' ? 'Daily' : 'Hourly'} Click Data: {getFilterDescription()}</span>
              {viewType === 'hourly' && <Clock className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardTitle>
          <CardDescription>
            Total clicks for this period: {clickData?.totalClicks || 0}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingClicks ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : viewType === 'daily' && chartData.length > 0 ? (
            // Daily view chart
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`${value} clicks`, 'Clicks']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
                  <Bar dataKey="value" fill="#3366FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : viewType === 'hourly' && clickData?.hourlyByDate && Object.keys(clickData.hourlyByDate).length > 0 ? (
            // Hourly view organized by date in table format
            <div className="space-y-8">
              {Object.entries(clickData.hourlyByDate || {}).map(([date, hourlyData], dateIndex) => (
                <div key={date} className="border rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Date: {date}</h3>
                  <div className="w-full overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-secondary">
                          <th className="p-2 text-left">Time</th>
                          <th className="p-2 text-left">Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(hourlyData as Record<string, number>)
                          .filter(([_, clicks]) => clicks > 0)
                          .sort((a, b) => {
                            const hourA = parseInt(a[0].split(':')[0]);
                            const hourB = parseInt(b[0].split(':')[0]);
                            return hourA - hourB;
                          })
                          .map(([hour, clicks], index) => (
                            <tr key={hour} className={index % 2 === 0 ? 'bg-card' : 'bg-muted'}>
                              <td className="p-2 border border-border">{hour}</td>
                              <td className="p-2 border border-border">{clicks}</td>
                            </tr>
                          ))}
                        {!Object.entries(hourlyData as Record<string, number>).some(([_, clicks]) => clicks > 0) && (
                          <tr>
                            <td colSpan={2} className="p-2 text-center text-muted-foreground">No clicks recorded</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {dateIndex < Object.entries(clickData.hourlyByDate || {}).length - 1 && (
                    <div className="mt-4 flex justify-center">
                      <p className="text-xs text-muted-foreground">Scroll down for next date</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : viewType === 'hourly' && chartData.length > 0 ? (
            // Fallback hourly view (for backward compatibility)
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`${value} clicks`, 'Clicks']}
                    labelFormatter={(label) => `Hour: ${label}`}
                  />
                  <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
                  <Bar dataKey="value" fill="#3366FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No click data available for the selected period.
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          <p>All times displayed in {timezone === "Asia/Kolkata" ? "Indian" : "UTC"} timezone ({getTimezoneLabel()})</p>
        </CardFooter>
      </Card>
    </DashboardShell>
  );
}