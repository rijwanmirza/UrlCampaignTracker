import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format, parseISO, subDays } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, BarChart2, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function CampaignClickDetailPage() {
  const [location, setLocation] = useLocation();
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("today");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [activeTab, setActiveTab] = useState("daily");
  
  // Extract campaign ID from URL
  useEffect(() => {
    const match = location.match(/\/campaign-click-detail\/(\d+)/);
    if (match && match[1]) {
      setCampaignId(parseInt(match[1]));
    }
    
    // Extract query parameters
    const urlParams = new URLSearchParams(location.split('?')[1]);
    
    if (urlParams.has('filterType')) {
      setFilterType(urlParams.get('filterType') || 'today');
    }
    
    if (urlParams.has('startDate') && urlParams.has('endDate')) {
      try {
        setStartDate(parseISO(urlParams.get('startDate') || ''));
        setEndDate(parseISO(urlParams.get('endDate') || ''));
      } catch (e) {
        console.error('Error parsing dates:', e);
      }
    }
  }, [location]);
  
  // Format query parameters
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      filterType,
      showHourly: 'true',
      _timestamp: Date.now().toString(), // Add timestamp to break cache
    };
    
    if (filterType === 'custom_range' && startDate && endDate) {
      params.startDate = format(startDate, 'yyyy-MM-dd');
      params.endDate = format(endDate, 'yyyy-MM-dd');
    }
    
    console.log(`📊 Client sending request with filter: ${filterType}`, params);
    return params;
  }, [filterType, startDate, endDate]);
  
  // Fetch campaign details
  const { data: campaignData, isLoading: isLoadingCampaign } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });
  
  // Fetch summary data with a fresh timestamp on each filter change
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: [`/api/campaign-click-records/summary/${campaignId}`, filterType, startDate, endDate],
    queryFn: async () => {
      // Add a fresh timestamp to ensure we break the cache
      const freshParams = {
        ...queryParams,
        _timestamp: Date.now().toString() 
      };
      
      // Build the query string
      const queryString = Object.entries(freshParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      
      const response = await fetch(`/api/campaign-click-records/summary/${campaignId}?${queryString}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }
      
      return await response.json();
    },
    enabled: !!campaignId,
    onSuccess: (data) => {
      console.log(`📊 Received filtered data for ${filterType} with ${data?.totalClicks || 0} total clicks`);
      console.log(`📊 Filter info:`, data?.filterInfo);
    },
    onError: (error) => {
      console.error(`❌ Error fetching filtered data:`, error);
    }
  });
  
  // Handle filter type change
  const handleFilterTypeChange = (value: string) => {
    // Log the filter change
    console.log(`📊 Filter type changed from ${filterType} to ${value}`);
    
    // Update the filter type state
    setFilterType(value);
    
    // Reset custom date range when switching to a different filter
    if (value !== 'custom_range') {
      if (value === 'last_7_days') {
        setStartDate(subDays(new Date(), 7));
      } else if (value === 'last_30_days') {
        setStartDate(subDays(new Date(), 30));
      }
      setEndDate(new Date());
    }
  };
  
  // Handle back button
  const handleBack = () => {
    setLocation('/campaign-click-records');
  };
  
  // Handle apply filter
  const handleApplyFilter = () => {
    // Requery with new parameters
    // The query will automatically refresh due to queryKey changes
  };
  
  // Toast hook for notifications
  const { toast } = useToast();
  
  // Create mutation for generating test data
  const generateTestDataMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId) return;
      const res = await apiRequest("POST", "/api/campaign-click-records/generate-specific-test-data", {
        campaignId,
        clicksPerDay: 20
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/campaign-click-records/summary/${campaignId}`]
      });
      toast({
        title: "Test data generated",
        description: `Created ${data.counts.total} test clicks across different time periods.`,
        duration: 5000
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate test data",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });
  
  // Format daily chart data
  const formatDailyChartData = () => {
    if (!summaryData) {
      console.log("No summary data available");
      return [{
        date: new Date().toISOString().split('T')[0],
        clicks: 0
      }];
    }
    
    // IMPORTANT: Use the totalClicks value directly from the API 
    // instead of processing/transforming it
    const totalClicksFromApi = parseInt(summaryData.totalClicks) || 0;
    
    // Create a default structure even if there's no dailyBreakdown
    if (!summaryData.dailyBreakdown || Object.keys(summaryData.dailyBreakdown).length === 0) {
      console.log("No daily breakdown data available");
      
      // Always use exact data from the API - if there are 0 clicks, show 0
      const today = new Date().toISOString().split('T')[0];
      return [{
        date: today,
        clicks: totalClicksFromApi
      }];
    }
    
    console.log("Raw daily breakdown data:", summaryData.dailyBreakdown);
    
    // If we have data, format it for the chart
    const formattedData = Object.entries(summaryData.dailyBreakdown).map(([date, count]) => ({
      date,
      clicks: count,
    }));
    
    // If there's no data after mapping but API says we have clicks,
    // create a single entry with the exact API-provided click count
    if (formattedData.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      formattedData.push({
        date: today,
        clicks: totalClicksFromApi
      });
    }
    
    console.log("Formatted daily data:", formattedData);
    return formattedData;
  };
  
  // Format hourly chart data
  const formatHourlyChartData = () => {
    if (!summaryData) {
      console.log("No summary data available");
      return Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        clicks: 0
      }));
    }
    
    // IMPORTANT: Use the totalClicks value directly from the API 
    // instead of processing/transforming it
    const totalClicksFromApi = parseInt(summaryData.totalClicks) || 0;
    
    if (!summaryData.hourlyBreakdown) {
      console.log("No hourly breakdown data available");
      
      // Always create an empty hourly chart - never distribute fake clicks
      return Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        clicks: 0
      }));
    }
    
    console.log("Raw hourly breakdown data:", summaryData.hourlyBreakdown);
    
    // If hourlyBreakdown array is empty, DON'T create fake distributed data
    if (summaryData.hourlyBreakdown.length === 0) {
      return Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        clicks: 0
      }));
    }
    
    const formattedData = summaryData.hourlyBreakdown.map(item => ({
      hour: `${item.hour}:00`,
      clicks: item.clicks,
    }));
    
    console.log("Formatted hourly data:", formattedData);
    return formattedData;
  };
  
  const isLoading = isLoadingCampaign || isLoadingSummary;
  
  // Custom tooltip formatter
  const customTooltipFormatter = (value: any, name: string) => {
    return [value, "Clicks"];
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div>
                <CardTitle className="text-2xl font-bold">
                  {isLoading ? 'Loading...' : campaignData?.name || `Campaign #${campaignId}`}
                </CardTitle>
                <CardDescription>
                  Click statistics and performance analysis
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateTestDataMutation.mutate()}
                disabled={generateTestDataMutation.isPending}
              >
                {generateTestDataMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Generate Test Data
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/campaigns/${campaignId}`}>
                  <BarChart2 className="h-4 w-4 mr-2" />
                  View Campaign Details
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div>
              <Select 
                value={filterType} 
                onValueChange={handleFilterTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="custom_range">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {filterType === 'custom_range' && (
              <>
                <div>
                  <DatePicker
                    date={startDate}
                    setDate={setStartDate}
                    placeholder="Start Date"
                  />
                </div>
                <div>
                  <DatePicker
                    date={endDate}
                    setDate={setEndDate}
                    placeholder="End Date"
                  />
                </div>
              </>
            )}
          </div>
          
          {filterType === 'custom_range' && (
            <div className="flex justify-end mb-6">
              <Button 
                onClick={handleApplyFilter}
                disabled={!startDate || !endDate}
              >
                Apply Filter
              </Button>
            </div>
          )}
          
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-1 gap-6 mb-6">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {summaryData?.filterInfo?.dateRange ?
                       `Clicks (${summaryData.filterInfo.dateRange})` :
                       filterType === 'total' ? 'Total Clicks' : 
                       filterType === 'today' ? 'Clicks (Today)' : 
                       filterType === 'yesterday' ? 'Clicks (Yesterday)' : 
                       filterType === 'last_7_days' ? 'Clicks (Last 7 Days)' : 
                       filterType === 'last_30_days' ? 'Clicks (Last 30 Days)' : 
                       filterType === 'this_month' ? 'Clicks (This Month)' : 
                       filterType === 'last_month' ? 'Clicks (Last Month)' : 
                       filterType === 'custom_range' && startDate && endDate ? 
                       `Clicks (${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')})` : 
                       'Filtered Clicks'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{summaryData?.totalClicks || 0}</div>
                  </CardContent>
                </Card>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
                <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                  <TabsTrigger value="daily">Daily View</TabsTrigger>
                  <TabsTrigger value="hourly">Hourly View</TabsTrigger>
                </TabsList>
                
                <TabsContent value="daily" className="pt-4">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={formatDailyChartData()}
                        margin={{ top: 10, right: 30, left: 0, bottom: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={customTooltipFormatter} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="clicks"
                          name="Clicks"
                          stroke="#8884d8"
                          fill="#8884d8"
                          fillOpacity={0.3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
                
                <TabsContent value="hourly" className="pt-4">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={formatHourlyChartData()}
                        margin={{ top: 10, right: 30, left: 0, bottom: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip formatter={customTooltipFormatter} />
                        <Legend />
                        <Bar
                          dataKey="clicks"
                          name="Clicks"
                          fill="#8884d8"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
              

            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}