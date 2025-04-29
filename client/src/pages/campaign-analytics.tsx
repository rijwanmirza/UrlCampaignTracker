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
import { Calendar as CalendarIcon, ChevronLeft, ArrowDownUp, Clock, Globe } from 'lucide-react';
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

export default function CampaignAnalyticsPage() {
  const { campaignId } = useParams();
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

  // Fetch campaign analytics data
  const { data: analyticsData, isLoading, error } = useQuery({
    queryKey: ['/api/analytics/campaign', campaignId, filterType, date, timezone],
    queryFn: async () => {
      let url = `/api/analytics/campaign/${campaignId}?filterType=${filterType}`;
      
      if (filterType === 'custom' && date?.from && date?.to) {
        url += `&startDate=${format(date.from, 'yyyy-MM-dd')}&endDate=${format(date.to, 'yyyy-MM-dd')}`;
      }
      
      url += `&timezone=${timezone}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch campaign analytics');
      }
      return response.json();
    },
    enabled: !!campaignId,
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

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Campaign Analytics</h1>
          {analyticsData?.campaign && (
            <p className="text-muted-foreground">
              {analyticsData.campaign.name} (ID: {analyticsData.campaign.id})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/analytics/campaigns">
            <Button variant="outline">
              <ChevronLeft className="mr-2 h-4 w-4" /> Back to Campaigns
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
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {analyticsData?.campaign?.totalClicks || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  During selected time period
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Clicks Remaining</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {analyticsData?.campaign?.clickLimit 
                    ? Math.max(0, analyticsData.campaign.clickLimit - (analyticsData.campaign.totalClicks || 0))
                    : '∞'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {analyticsData?.campaign?.clickLimit 
                    ? `Out of ${analyticsData.campaign.clickLimit} limit`
                    : 'No click limit set'}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active URLs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {analyticsData?.campaign?.urls?.filter(u => u.status === 'active')?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Out of {analyticsData?.campaign?.urls?.length || 0} total URLs
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">URL Multiplier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {analyticsData?.campaign?.multiplier || 1}x
                </div>
                <p className="text-xs text-muted-foreground">
                  Applied to original click values
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Analytics Content */}
          <Tabs defaultValue="overview" className="mb-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="devices">Devices & Browsers</TabsTrigger>
              <TabsTrigger value="urls">Top URLs</TabsTrigger>
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
            
            <TabsContent value="urls" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing URLs</CardTitle>
                  <CardDescription>
                    URLs with the highest number of clicks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsData?.topUrls?.length > 0 ? (
                    <div className="space-y-4">
                      {analyticsData.topUrls.map((url, index) => (
                        <div key={url.id} className="flex items-center justify-between border-b pb-4">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                              {index + 1}
                            </div>
                            <div className="ml-4">
                              <div className="font-medium">{url.name}</div>
                              <div className="text-sm text-muted-foreground truncate max-w-[300px]">
                                {url.targetUrl}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{url.clicks} clicks</div>
                            <Link href={`/analytics/url/${url.id}`}>
                              <Button variant="ghost" size="sm">View Details</Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6">
                      <p className="text-muted-foreground">No URL data available for this period</p>
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