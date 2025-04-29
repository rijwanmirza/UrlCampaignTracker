import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, BarChart3, TrendingUp, Calendar, ArrowRight } from 'lucide-react';

interface AnalyticsSummary {
  totalClicks: number;
  totalCampaigns: number;
  totalUrls: number;
  averageClicksPerUrl: number;
  clicksByDate: Record<string, number>;
  topCampaigns: { id: number; name: string; clicks: number }[];
  topUrls: { id: number; name: string; clicks: number }[];
}

// Helper function to format date strings for display
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>('total');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  
  // Analytics data query
  const { data, isLoading, error, refetch } = useQuery<AnalyticsSummary>({
    queryKey: ['/api/analytics/summary', filterType, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ filterType });
      
      if (startDate && endDate && filterType === 'custom_range') {
        params.append('startDate', startDate.toISOString().split('T')[0]);
        params.append('endDate', endDate.toISOString().split('T')[0]);
      }
      
      const response = await fetch(`/api/analytics/summary?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return response.json();
    },
  });
  
  // Transform clicksByDate data for the chart
  const chartData = data?.clicksByDate ? 
    Object.entries(data.clicksByDate)
      .map(([date, clicks]) => ({ 
        date: formatDate(date), 
        clicks 
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];
  
  // Handle filter change
  const handleFilterChange = (value: string) => {
    setFilterType(value);
  };
  
  // Apply custom date range filter
  const applyCustomDateRange = () => {
    if (startDate && endDate) {
      if (endDate < startDate) {
        toast({
          title: 'Invalid Date Range',
          description: 'End date must be after start date',
          variant: 'destructive',
        });
        return;
      }
      
      setFilterType('custom_range');
      refetch();
    } else {
      toast({
        title: 'Date Range Required',
        description: 'Please select both start and end dates',
        variant: 'destructive',
      });
    }
  };
  
  // Reset custom date range
  const resetDateRange = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setFilterType('total');
  };
  
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>
      
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Card className="w-full md:w-1/3">
          <CardHeader className="pb-2">
            <CardTitle>Time Range</CardTitle>
            <CardDescription>Select a predefined range or custom dates</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={filterType} onValueChange={handleFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom_range">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {filterType === 'custom_range' && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <DatePicker 
                    date={startDate} 
                    setDate={setStartDate} 
                    className="w-full"
                  />
                </div>
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <DatePicker 
                    date={endDate} 
                    setDate={setEndDate} 
                    className="w-full"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button onClick={applyCustomDateRange} className="flex-1">
                    Apply
                  </Button>
                  <Button variant="outline" onClick={resetDateRange} className="flex-1">
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full md:w-2/3">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : data?.totalClicks.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                Across all campaigns and URLs
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : data?.totalCampaigns.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                Total active campaigns
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Avg. Clicks</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : data?.averageClicksPerUrl.toLocaleString() || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                Per URL average
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Top Campaigns</TabsTrigger>
          <TabsTrigger value="urls">Top URLs</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Click Traffic Over Time</CardTitle>
              <CardDescription>
                Click volume trends for the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 60,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      angle={-45} 
                      textAnchor="end"
                      height={60}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                    <Bar dataKey="clicks" fill="#8884d8" name="Clicks" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <BarChart3 className="h-12 w-12 mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">No Data Available</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no clicks recorded for the selected time period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="campaigns">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Campaigns</CardTitle>
              <CardDescription>
                Campaigns with the highest click volumes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data?.topCampaigns && data.topCampaigns.length > 0 ? (
                <div className="space-y-4">
                  {data.topCampaigns.map((campaign) => (
                    <div key={campaign.id} className="flex items-center justify-between border-b pb-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{campaign.name}</span>
                        <span className="text-sm text-muted-foreground">Campaign ID: {campaign.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{campaign.clicks.toLocaleString()} clicks</span>
                        <Link href={`/campaign-analytics/${campaign.id}`}>
                          <Button variant="outline" size="sm">
                            Details <ArrowRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <h3 className="text-lg font-medium">No Campaign Data</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no campaigns with clicks in the selected time period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="urls">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing URLs</CardTitle>
              <CardDescription>
                URLs with the highest click volumes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data?.topUrls && data.topUrls.length > 0 ? (
                <div className="space-y-4">
                  {data.topUrls.map((url) => (
                    <div key={url.id} className="flex items-center justify-between border-b pb-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{url.name}</span>
                        <span className="text-sm text-muted-foreground">URL ID: {url.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{url.clicks.toLocaleString()} clicks</span>
                        <Link href={`/url-analytics/${url.id}`}>
                          <Button variant="outline" size="sm">
                            Details <ArrowRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <h3 className="text-lg font-medium">No URL Data</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no URLs with clicks in the selected time period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}