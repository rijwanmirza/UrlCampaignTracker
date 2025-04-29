import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, addDays, subDays, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths, subYears } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ArrowUpRight, Clock, Globe, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// Import chart components (you may need to install recharts)
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const FILTER_OPTIONS = [
  { value: 'total', label: 'Total (All Time)' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last-2-days', label: 'Last 2 Days' },
  { value: 'last-3-days', label: 'Last 3 Days' },
  { value: 'last-4-days', label: 'Last 4 Days' },
  { value: 'last-5-days', label: 'Last 5 Days' },
  { value: 'last-6-days', label: 'Last 6 Days' },
  { value: 'last-7-days', label: 'Last 7 Days' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'last-6-months', label: 'Last 6 Months' },
  { value: 'custom', label: 'Custom Date Range' },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1'];

export default function UrlAnalyticsPage() {
  const { urlId } = useParams();
  const [filterType, setFilterType] = useState<string>('total');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [showHourly, setShowHourly] = useState<boolean>(false);
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  // Update date range when filter type changes
  useEffect(() => {
    const now = new Date();
    
    if (filterType === 'this-year') {
      setDate({
        from: startOfYear(now),
        to: now,
      });
    } else if (filterType === 'last-year') {
      const lastYear = subYears(now, 1);
      setDate({
        from: startOfYear(lastYear),
        to: endOfYear(lastYear),
      });
    } else if (filterType === 'today') {
      setDate({
        from: now,
        to: now,
      });
    } else if (filterType === 'yesterday') {
      const yesterday = subDays(now, 1);
      setDate({
        from: yesterday,
        to: yesterday,
      });
    } else if (filterType.startsWith('last-')) {
      const days = parseInt(filterType.split('-')[1]);
      setDate({
        from: subDays(now, days - 1),
        to: now,
      });
    } else if (filterType === 'this-month') {
      setDate({
        from: startOfMonth(now),
        to: now,
      });
    } else if (filterType === 'last-month') {
      const lastMonth = subMonths(now, 1);
      setDate({
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      });
    } else if (filterType === 'last-6-months') {
      setDate({
        from: subMonths(now, 6),
        to: now,
      });
    } else if (filterType === 'total') {
      setDate(undefined);
    }
    // Custom date range is handled by the date picker
  }, [filterType]);

  // Fetch URL analytics data
  const { data: analyticsData, isLoading, error } = useQuery({
    queryKey: ['/api/analytics/url', urlId, filterType, date, timezone],
    queryFn: async () => {
      let url = `/api/analytics/url/${urlId}?filterType=${filterType}`;
      
      if (filterType === 'custom' && date?.from && date?.to) {
        url += `&startDate=${format(date.from, 'yyyy-MM-dd')}&endDate=${format(date.to, 'yyyy-MM-dd')}`;
      }
      
      url += `&timezone=${timezone}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch URL analytics');
      }
      return response.json();
    },
    enabled: !!urlId,
  });

  // Format date range for display
  const formatDateRange = () => {
    if (!date?.from) return 'All Time';
    
    if (date.to && date.from.getTime() !== date.to.getTime()) {
      return `${format(date.from, 'MMM d, yyyy')} - ${format(date.to, 'MMM d, yyyy')}`;
    }
    
    return format(date.from, 'MMMM d, yyyy');
  };

  // Prepare data for charts
  const prepareClicksByDateChart = () => {
    if (!analyticsData?.clicksByDate) return [];
    
    return Object.entries(analyticsData.clicksByDate).map(([date, clicks]) => ({
      date,
      clicks,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const prepareClicksByHourChart = () => {
    if (!analyticsData?.clicksByHour) return [];
    
    return Array.from({ length: 24 }, (_, hour) => {
      const hourStr = hour.toString();
      return {
        hour: `${hour}:00`,
        clicks: analyticsData.clicksByHour[hourStr] || 0,
      };
    });
  };

  const prepareDeviceChart = () => {
    if (!analyticsData?.clicksByDevice) return [];
    
    return Object.entries(analyticsData.clicksByDevice).map(([device, clicks]) => ({
      name: device,
      value: clicks,
    }));
  };

  const prepareBrowserChart = () => {
    if (!analyticsData?.clicksByBrowser) return [];
    
    return Object.entries(analyticsData.clicksByBrowser).map(([browser, clicks]) => ({
      name: browser,
      value: clicks,
    }));
  };

  const prepareReferrerChart = () => {
    if (!analyticsData?.clicksByReferrer) return [];
    
    return Object.entries(analyticsData.clicksByReferrer)
      .map(([referrer, clicks]) => ({
        name: referrer || 'Direct',
        value: clicks,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10 referrers
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">URL Analytics</h1>
          {analyticsData?.url && (
            <div>
              <p className="text-muted-foreground">
                {analyticsData.url.name} (ID: {analyticsData.url.id})
              </p>
              <p className="text-xs text-muted-foreground">
                Campaign: {analyticsData.url.campaignName} (ID: {analyticsData.url.campaignId})
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/analytics/urls">
            <Button variant="outline">
              <ChevronLeft className="mr-2 h-4 w-4" /> Back to URLs
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Analytics Filters</CardTitle>
          <CardDescription>
            Customize your analytics view with these filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Time Range</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filterType === 'custom' && (
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date?.from ? (
                        date.to ? (
                          <>
                            {format(date.from, 'LLL dd, y')} -{' '}
                            {format(date.to, 'LLL dd, y')}
                          </>
                        ) : (
                          format(date.from, 'LLL dd, y')
                        )
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={date?.from}
                      selected={date}
                      onSelect={setDate}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Timezone</label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Hourly Breakdown</label>
              <Button 
                variant={showHourly ? "default" : "outline"}
                className="w-full"
                onClick={() => setShowHourly(!showHourly)}
              >
                <Clock className="mr-2 h-4 w-4" />
                {showHourly ? "Hide Hourly Data" : "Show Hourly Data"}
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-4 flex justify-between">
          <div>
            <span className="text-sm font-medium">Current View:</span>{' '}
            <span className="text-sm">{formatDateRange()}</span>
          </div>
          <div>
            <span className="text-sm font-medium">Timezone:</span>{' '}
            <span className="text-sm">{timezone}</span>
          </div>
        </CardFooter>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading analytics data...</span>
        </div>
      ) : error ? (
        <Card className="bg-destructive/10">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-medium">Failed to load analytics</h3>
              <p className="text-muted-foreground">
                Please try again or contact support if the problem persists.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* URL Details */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>URL Details</CardTitle>
              <CardDescription>
                Target information and click metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Target Information</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm font-medium block">Name:</span>
                      <span>{analyticsData?.url?.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium block">Target URL:</span>
                      <a 
                        href={analyticsData?.url?.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 flex items-center"
                      >
                        <span className="truncate">{analyticsData?.url?.targetUrl || 'N/A'}</span>
                        <ExternalLink className="h-3 w-3 ml-1 inline" />
                      </a>
                    </div>
                    <div>
                      <span className="text-sm font-medium block">Campaign:</span>
                      <Link href={`/analytics/campaign/${analyticsData?.url?.campaignId}`}>
                        <span className="text-blue-500 hover:text-blue-700">
                          {analyticsData?.url?.campaignName || 'N/A'}
                        </span>
                      </Link>
                    </div>
                    <div>
                      <span className="text-sm font-medium block">Created At:</span>
                      <span>{analyticsData?.url?.createdAt ? new Date(analyticsData.url.createdAt).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium block">Status:</span>
                      <span className={`rounded-full px-2 py-1 text-xs ${
                        analyticsData?.url?.status === 'active' ? 'bg-green-100 text-green-800' :
                        analyticsData?.url?.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                        analyticsData?.url?.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {analyticsData?.url?.status || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">Click Metrics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <span className="text-3xl font-bold block">
                            {analyticsData?.url?.totalClicks || 0}
                          </span>
                          <span className="text-sm text-muted-foreground">Total Clicks</span>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <span className="text-3xl font-bold block">
                            {analyticsData?.url?.clickLimit 
                              ? Math.max(0, analyticsData.url.clickLimit - (analyticsData.url.totalClicks || 0))
                              : '∞'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {analyticsData?.url?.clickLimit 
                              ? 'Clicks Remaining'
                              : 'No Limit'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <span className="text-3xl font-bold block">
                            {analyticsData?.url?.originalClickLimit || 0}
                          </span>
                          <span className="text-sm text-muted-foreground">Original Limit</span>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <span className="text-3xl font-bold block">
                            {analyticsData?.url?.clickLimit || 0}
                          </span>
                          <span className="text-sm text-muted-foreground">Current Limit</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Analytics Content */}
          <Tabs defaultValue="overview" className="mb-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="devices">Devices & Browsers</TabsTrigger>
              <TabsTrigger value="referrers">Referrers</TabsTrigger>
              {showHourly && <TabsTrigger value="hourly">Hourly Breakdown</TabsTrigger>}
            </TabsList>
            
            <TabsContent value="overview" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Click Trends</CardTitle>
                  <CardDescription>
                    Click trends over the selected date range
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {prepareClicksByDateChart().length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={prepareClicksByDateChart()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="clicks" 
                          stroke="#8884d8" 
                          activeDot={{ r: 8 }}
                          name="Clicks"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex justify-center items-center h-full">
                      <p className="text-muted-foreground">No click data available for this period</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="devices" className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Device Distribution</CardTitle>
                    <CardDescription>
                      Clicks by device type
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    {prepareDeviceChart().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={prepareDeviceChart()}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {prepareDeviceChart().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} clicks`, 'Count']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex justify-center items-center h-full">
                        <p className="text-muted-foreground">No device data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Browser Distribution</CardTitle>
                    <CardDescription>
                      Clicks by browser type
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    {prepareBrowserChart().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={prepareBrowserChart()}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {prepareBrowserChart().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} clicks`, 'Count']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex justify-center items-center h-full">
                        <p className="text-muted-foreground">No browser data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="referrers" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Referrers</CardTitle>
                  <CardDescription>
                    Sources directing traffic to this URL
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {prepareReferrerChart().length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={prepareReferrerChart()} 
                        layout="vertical"
                        margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          tick={{ fontSize: 12 }}
                          width={100}
                        />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" name="Clicks" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex justify-center items-center h-full">
                      <p className="text-muted-foreground">No referrer data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {showHourly && (
              <TabsContent value="hourly" className="pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Hourly Click Distribution</CardTitle>
                    <CardDescription>
                      Click distribution by hour of the day ({timezone})
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    {prepareClicksByHourChart().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={prepareClicksByHourChart()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="clicks" name="Clicks" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex justify-center items-center h-full">
                        <p className="text-muted-foreground">No hourly data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}