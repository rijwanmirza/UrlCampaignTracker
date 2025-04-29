import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Loader2, ArrowLeft, ExternalLink, Globe, Clock, Users } from 'lucide-react';

interface UrlAnalytics {
  url: {
    id: number;
    name: string;
    targetUrl: string;
    campaignId: number;
    campaignName: string;
    totalClicks: number;
    clickLimit: number; 
    originalClickLimit: number;
    createdAt: string;
    status: string;
  };
  clicksByDate: Record<string, number>;
  clicksByHour: Record<string, number>;
  clicksByReferrer: Record<string, number>;
  clicksByDevice: Record<string, number>;
  clicksByBrowser: Record<string, number>;
  clicksByCountry: Record<string, number>;
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

// Colors for pie charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function UrlAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>('total');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  // Analytics data query
  const { data, isLoading, error, refetch } = useQuery<UrlAnalytics>({
    queryKey: [`/api/analytics/url/${id}`, filterType, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ filterType });
      
      if (startDate && endDate && filterType === 'custom_range') {
        params.append('startDate', startDate.toISOString().split('T')[0]);
        params.append('endDate', endDate.toISOString().split('T')[0]);
      }
      
      const response = await fetch(`/api/analytics/url/${id}?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch URL analytics data');
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
        name: device || 'Unknown', 
        value: clicks 
      }))
      .sort((a, b) => b.value - a.value)
    : [];

  const browserChartData = data?.clicksByBrowser 
    ? Object.entries(data.clicksByBrowser)
      .map(([browser, clicks]) => ({ 
        name: browser || 'Unknown', 
        value: clicks 
      }))
      .sort((a, b) => b.value - a.value)
    : [];

  const referrerChartData = data?.clicksByReferrer 
    ? Object.entries(data.clicksByReferrer)
      .map(([referrer, clicks]) => ({
        name: referrer ? (referrer.length > 30 ? referrer.substring(0, 30) + '...' : referrer) : 'Direct',
        fullName: referrer || 'Direct',
        value: clicks
      }))
      .sort((a, b) => b.value - a.value)
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

  // Calculate progress percentage
  const calculateClickProgress = () => {
    if (!data) return 0;
    const { totalClicks, clickLimit } = data.url;
    if (clickLimit <= 0) return 100;
    return Math.min(Math.round((totalClicks / clickLimit) * 100), 100);
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
          <h2 className="text-xl font-bold text-destructive">Error Loading URL Analytics</h2>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : 'Failed to load URL data'}</p>
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

  const progress = calculateClickProgress();

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
            <h1 className="text-3xl font-bold">{data.url.name}</h1>
          </div>
          <Link href={`/campaign-analytics/${data.url.campaignId}`}>
            <p className="text-muted-foreground hover:underline cursor-pointer">
              Campaign: {data.url.campaignName}
            </p>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs ${
            data.url.status === 'active' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
          }`}>
            {data.url.status.toUpperCase()}
          </span>
          <span className="text-muted-foreground text-sm">
            Created {new Date(data.url.createdAt).toLocaleDateString()}
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
        
        <div className="w-full md:w-2/3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>URL Details</CardTitle>
              <CardDescription>
                <a 
                  href={data.url.targetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center text-blue-500 hover:underline"
                >
                  {data.url.targetUrl.length > 50 
                    ? data.url.targetUrl.substring(0, 50) + '...' 
                    : data.url.targetUrl
                  }
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium">Total Clicks</h3>
                  <p className="text-2xl font-bold">{data.url.totalClicks.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Original Limit</h3>
                  <p className="text-2xl font-bold">{data.url.originalClickLimit.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Current Limit</h3>
                  <p className="text-2xl font-bold">{data.url.clickLimit.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between mb-1 text-sm">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div 
                    className={`h-2.5 rounded-full ${
                      progress < 70 
                        ? 'bg-blue-600' 
                        : progress < 90 
                        ? 'bg-yellow-400' 
                        : 'bg-red-600'
                    }`} 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.url.totalClicks.toLocaleString()} of {data.url.clickLimit.toLocaleString()} clicks used
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Tabs defaultValue="traffic_over_time" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="traffic_over_time">Traffic Over Time</TabsTrigger>
          <TabsTrigger value="hourly_pattern">Hourly Pattern</TabsTrigger>
          <TabsTrigger value="referrers">Referrers</TabsTrigger>
          <TabsTrigger value="devices">Devices & Browsers</TabsTrigger>
        </TabsList>
        
        <TabsContent value="traffic_over_time">
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
                  <LineChart
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
                    <Line 
                      type="monotone" 
                      dataKey="clicks" 
                      stroke="#8884d8" 
                      activeDot={{ r: 8 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Clock className="h-12 w-12 mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">No Data Available</h3>
                  <p className="text-muted-foreground mt-1">
                    There are no clicks recorded for the selected time period
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="hourly_pattern">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Click Distribution (UTC)</CardTitle>
              <CardDescription>
                When users are most active throughout the day
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
                  <h3 className="text-lg font-medium">No Hourly Data</h3>
                  <p className="text-muted-foreground mt-1">
                    Hourly distribution data not available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="referrers">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
              <CardDescription>
                Where clicks are coming from
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px]">
              {referrerChartData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                  <div className="flex flex-col justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={referrerChartData.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {referrerChartData.slice(0, 5).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name, props) => [`${value} clicks`, props.payload.fullName]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-y-auto max-h-[300px]">
                    <div className="space-y-3">
                      {referrerChartData.map((item, index) => (
                        <div key={index} className="flex justify-between items-center border-b pb-2">
                          <div className="truncate max-w-[70%]" title={item.fullName}>
                            {item.name}
                          </div>
                          <div className="font-medium">
                            {item.value.toLocaleString()} clicks
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Globe className="h-12 w-12 mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium">No Referrer Data</h3>
                  <p className="text-muted-foreground mt-1">
                    Referrer information not available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="devices">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Device Types</CardTitle>
                <CardDescription>
                  Click distribution by device
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {deviceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {deviceChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Users className="h-12 w-12 mb-4 text-muted-foreground" />
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
                  Click distribution by browser
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {browserChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={browserChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {browserChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} clicks`, 'Clicks']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Globe className="h-12 w-12 mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium">No Browser Data</h3>
                    <p className="text-muted-foreground mt-1">
                      Browser information not available
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