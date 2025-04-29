import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, ArrowLeft, Clock, Activity, Users, Globe } from 'lucide-react';

interface CampaignAnalytics {
  campaign: {
    id: number;
    name: string;
    totalClicks: number;
    totalUrls: number;
    createdAt: string;
    status: string;
  };
  clicksByDate: Record<string, number>;
  clicksByHour: Record<string, number>;
  clicksByDevice: Record<string, number>;
  clicksByBrowser: Record<string, number>;
  clicksByCountry: Record<string, number>;
  topUrls: {
    id: number;
    name: string;
    clicks: number;
    targetUrl: string;
  }[];
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

export default function CampaignAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>('total');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Analytics data query
  const { data, isLoading, error, refetch } = useQuery<CampaignAnalytics>({
    queryKey: [`/api/analytics/campaign/${id}`, filterType, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ filterType });
      
      if (startDate && endDate && filterType === 'custom_range') {
        params.append('startDate', startDate.toISOString().split('T')[0]);
        params.append('endDate', endDate.toISOString().split('T')[0]);
      }
      
      const response = await fetch(`/api/analytics/campaign/${id}?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch campaign analytics data');
      }
      return response.json();
    },
  });

  // Transform data for charts
  const dateChartData = data?.clicksByDate 
    ? Object.entries(data.clicksByDate)
      .map(([date, clicks]) => ({ 
        date: formatDate(date), 
        clicks 
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const hourlyChartData = data?.clicksByHour 
    ? Object.entries(data.clicksByHour)
      .map(([hour, clicks]) => ({ 
        hour: `${hour}:00`, 
        clicks 
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    : [];

  const deviceChartData = data?.clicksByDevice 
    ? Object.entries(data.clicksByDevice)
      .map(([device, clicks]) => ({ 
        device: device || 'Unknown', 
        clicks 
      }))
      .sort((a, b) => b.clicks - a.clicks)
    : [];

  const browserChartData = data?.clicksByBrowser 
    ? Object.entries(data.clicksByBrowser)
      .map(([browser, clicks]) => ({ 
        browser: browser || 'Unknown', 
        clicks 
      }))
      .sort((a, b) => b.clicks - a.clicks)
    : [];

  const countryChartData = data?.clicksByCountry 
    ? Object.entries(data.clicksByCountry)
      .map(([country, clicks]) => ({ 
        country: country || 'Unknown', 
        clicks 
      }))
      .sort((a, b) => b.clicks - a.clicks)
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
    refetch();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-destructive/15 p-4 rounded-md mb-6">
          <h2 className="text-xl font-bold text-destructive">Error Loading Campaign Analytics</h2>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : 'Failed to load campaign data'}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
        <Link href="/analytics">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Analytics
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/analytics">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">{data.campaign.name}</h1>
          </div>
          <p className="text-muted-foreground">Campaign ID: {data.campaign.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs ${
            data.campaign.status === 'active' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
          }`}>
            {data.campaign.status.toUpperCase()}
          </span>
          <span className="text-muted-foreground text-sm">
            Created {new Date(data.campaign.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

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
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.campaign.totalClicks.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                For all URLs in this campaign
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">URLs</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.campaign.totalUrls.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Total active URLs
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Per URL</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.campaign.totalUrls > 0 
                  ? Math.round(data.campaign.totalClicks / data.campaign.totalUrls).toLocaleString() 
                  : '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                Average clicks per URL
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Tabs defaultValue="clicks_by_date" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="clicks_by_date">Clicks by Date</TabsTrigger>
          <TabsTrigger value="clicks_by_hour">Hourly Distribution</TabsTrigger>
          <TabsTrigger value="top_urls">Top URLs</TabsTrigger>
          <TabsTrigger value="geo_device">Device & Location</TabsTrigger>
        </TabsList>
        
        <TabsContent value="clicks_by_date">
          <Card>
            <CardHeader>
              <CardTitle>Click Traffic Over Time</CardTitle>
              <CardDescription>
                Click volume trends for the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {dateChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dateChartData}
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
                  <Activity className="h-12 w-12 mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">No Data Available</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no clicks recorded for the selected time period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="clicks_by_hour">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Click Distribution</CardTitle>
              <CardDescription>
                Click patterns by hour of day (UTC)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {hourlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hourlyChartData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 20,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                    <Bar dataKey="clicks" fill="#82ca9d" name="Clicks" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Clock className="h-12 w-12 mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">No Data Available</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no hourly statistics available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="top_urls">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing URLs</CardTitle>
              <CardDescription>
                URLs with the highest click volumes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.topUrls.length > 0 ? (
                <div className="space-y-4">
                  {data.topUrls.map((url) => (
                    <div key={url.id} className="flex items-center justify-between border-b pb-3">
                      <div className="flex flex-col max-w-[60%]">
                        <span className="font-medium">{url.name}</span>
                        <span className="text-sm text-muted-foreground truncate">{url.targetUrl}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{url.clicks.toLocaleString()} clicks</span>
                        <Link href={`/url-analytics/${url.id}`}>
                          <Button variant="outline" size="sm">
                            Details
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
        
        <TabsContent value="geo_device">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Device Types</CardTitle>
                <CardDescription>
                  Click distribution by device type
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {deviceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={deviceChartData}
                      layout="vertical"
                      margin={{
                        top: 20,
                        right: 30,
                        left: 50,
                        bottom: 20,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="device" type="category" width={100} />
                      <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                      <Bar dataKey="clicks" fill="#8884d8" name="Clicks" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <h3 className="text-lg font-medium">No Device Data</h3>
                    <p className="text-muted-foreground mt-1">
                      Device information not available
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Browsers</CardTitle>
                <CardDescription>
                  Click distribution by browser type
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {browserChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={browserChartData}
                      layout="vertical"
                      margin={{
                        top: 20,
                        right: 30,
                        left: 50,
                        bottom: 20,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="browser" type="category" width={100} />
                      <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                      <Bar dataKey="clicks" fill="#82ca9d" name="Clicks" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <h3 className="text-lg font-medium">No Browser Data</h3>
                    <p className="text-muted-foreground mt-1">
                      Browser information not available
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
                <CardDescription>
                  Click distribution by country
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {countryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={countryChartData.slice(0, 10)} // Show top 10 countries
                      layout="vertical"
                      margin={{
                        top: 20,
                        right: 30,
                        left: 100,
                        bottom: 20,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="country" type="category" width={100} />
                      <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                      <Bar dataKey="clicks" fill="#8884d8" name="Clicks" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Globe className="h-12 w-12 mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium">No Geographic Data</h3>
                    <p className="text-muted-foreground mt-1">
                      Location information not available
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}