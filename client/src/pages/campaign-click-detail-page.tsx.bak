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
    queryKey: ['/api/campaigns', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) throw new Error('Failed to fetch campaign');
      return response.json();
    },
    enabled: !!campaignId,
  });
  
  // Fetch click summary
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['/api/campaign-click-records/summary', campaignId, queryParams],
    queryFn: async () => {
      if (!campaignId) return null;
      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/api/campaign-click-records/summary/${campaignId}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch click summary');
      return response.json();
    },
    enabled: !!campaignId,
  });
  
  // Handle filter type change
  const handleFilterTypeChange = (value: string) => {
    setFilterType(value);
  };
  
  // Navigate back to records page
  const handleBack = () => {
    setLocation('/campaign-click-records');
  };
  
  // Format daily chart data
  const formatDailyChartData = () => {
    if (!summaryData || !summaryData.dailyBreakdown) return [];
    
    return Object.entries(summaryData.dailyBreakdown).map(([date, count]) => ({
      date: format(parseISO(date), 'MMM dd'),
      clicks: count,
    }));
  };
  
  // Format hourly chart data
  const formatHourlyChartData = () => {
    if (!summaryData || !summaryData.hourlyBreakdown) return [];
    
    return Object.entries(summaryData.hourlyBreakdown).map(([hour, count]) => ({
      hour: `${hour}:00`,
      clicks: count,
    }));
  };
  
  const isLoading = isLoadingCampaign || isLoadingSummary;
  
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
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={isLoading}
                    placeholder="Start Date"
                  />
                </div>
                <div>
                  <DatePicker
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={isLoading}
                    placeholder="End Date"
                  />
                </div>
              </>
            )}
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <div className="text-5xl font-bold mb-2">
                      {summaryData?.totalClicks || 0}
                    </div>
                    <p className="text-muted-foreground">Total Clicks</p>
                  </CardContent>
                </Card>
                
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <div className="text-5xl font-bold mb-2">
                      {summaryData?.uniqueIPs || 0}
                    </div>
                    <p className="text-muted-foreground">Unique Visitors</p>
                  </CardContent>
                </Card>
                
                <Card className="shadow-sm">
                  <CardContent className="pt-6">
                    <div className="text-5xl font-bold mb-2">
                      {summaryData?.avgClicksPerHour || 0}
                    </div>
                    <p className="text-muted-foreground">Avg. Clicks per Hour</p>
                  </CardContent>
                </Card>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="daily">Daily Breakdown</TabsTrigger>
                  <TabsTrigger value="hourly">Hourly Breakdown</TabsTrigger>
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
                        <Tooltip />
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
                        <Tooltip />
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
              
              {summaryData?.topReferrers && (
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle>Top Referrers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(summaryData.topReferrers).length > 0 ? (
                        Object.entries(summaryData.topReferrers)
                          .sort(([, a], [, b]) => (b as number) - (a as number))
                          .slice(0, 5)
                          .map(([referrer, count]) => (
                            <div key={referrer} className="flex justify-between items-center">
                              <span>{referrer || '(Direct)'}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))
                      ) : (
                        <div className="text-muted-foreground">No referrer data available</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}