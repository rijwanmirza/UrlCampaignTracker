import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Loader2, ChevronLeft, BarChart2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const queryParams: Record<string, string> = {
    filterType,
    showHourly: 'true',
  };
  
  if (filterType === 'custom_range' && startDate && endDate) {
    queryParams.startDate = format(startDate, 'yyyy-MM-dd');
    queryParams.endDate = format(endDate, 'yyyy-MM-dd');
  }
  
  // Fetch campaign details
  const { data: campaignData, isLoading: isLoadingCampaign } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });
  
  // Fetch summary data
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: [`/api/campaign-click-records/summary/${campaignId}`, queryParams],
    enabled: !!campaignId,
  });
  
  // Handle filter type change
  const handleFilterTypeChange = (value: string) => {
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
  
  // Format daily chart data
  const formatDailyChartData = () => {
    if (!summaryData || !summaryData.dailyBreakdown) {
      console.log("No daily breakdown data available");
      return [];
    }
    
    console.log("Raw daily breakdown data:", summaryData.dailyBreakdown);
    
    // If we have data, format it for the chart
    const formattedData = Object.entries(summaryData.dailyBreakdown).map(([date, count]) => ({
      date,
      clicks: count,
    }));
    
    // If there's no data for the selected time period, create a single entry with 0 clicks
    if (formattedData.length === 0) {
      const today = new Date();
      formattedData.push({
        date: today.toISOString().split('T')[0],
        clicks: 0
      });
    }
    
    console.log("Formatted daily data:", formattedData);
    return formattedData;
  };
  
  // Format hourly chart data
  const formatHourlyChartData = () => {
    if (!summaryData || !summaryData.hourlyBreakdown) {
      console.log("No hourly breakdown data available");
      
      // Create a default hourly chart with 0 clicks for each hour
      const defaultData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        clicks: 0
      }));
      
      return defaultData;
    }
    
    console.log("Raw hourly breakdown data:", summaryData.hourlyBreakdown);
    
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
                    <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
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