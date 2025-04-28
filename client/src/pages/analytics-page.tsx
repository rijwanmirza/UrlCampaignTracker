import React, { useState } from 'react';
import { Link } from 'wouter';
import { AnalyticsFilter, timezones } from '@shared/schema';
import { useAnalytics, useAnalyticsCampaigns, useAnalyticsUrls } from '@/hooks/use-analytics';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const AnalyticsPage: React.FC = () => {
  // State for analytics filter
  const [filter, setFilter] = useState<AnalyticsFilter>({
    type: 'campaign',
    id: 0,
    timeRange: 'today',
    groupBy: 'day',
    timezone: 'UTC'
  });
  
  // State for resource selection
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch data based on filter
  const { data: analyticsData, isLoading: isLoadingAnalytics } = useAnalytics(filter);
  const { data: campaigns, isLoading: isLoadingCampaigns } = useAnalyticsCampaigns();
  const { data: urls, isLoading: isLoadingUrls } = useAnalyticsUrls(searchTerm);
  
  // Custom date range selection
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  // Handle resource selection
  const handleResourceTypeChange = (value: string) => {
    setFilter(prev => ({
      ...prev,
      type: value as 'campaign' | 'url',
      id: 0 // Reset ID when changing resource type
    }));
  };
  
  const handleResourceSelect = (id: number) => {
    setFilter(prev => ({
      ...prev,
      id
    }));
  };
  
  // Handle time range selection
  const handleTimeRangeChange = (value: string) => {
    // If selecting custom, don't update yet
    if (value === 'custom' && (!startDate || !endDate)) {
      setFilter(prev => ({
        ...prev,
        timeRange: value as any
      }));
      return;
    }
    
    // Update filter with time range
    setFilter(prev => ({
      ...prev,
      timeRange: value as any,
      startDate: value === 'custom' ? startDate?.toISOString() : undefined,
      endDate: value === 'custom' ? endDate?.toISOString() : undefined
    }));
  };
  
  // Apply custom date range
  const applyCustomDateRange = () => {
    if (startDate && endDate) {
      setFilter(prev => ({
        ...prev,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }));
    }
  };
  
  // Handle group by change
  const handleGroupByChange = (value: string) => {
    setFilter(prev => ({
      ...prev,
      groupBy: value as any
    }));
  };
  
  // Handle timezone change
  const handleTimezoneChange = (value: string) => {
    setFilter(prev => ({
      ...prev,
      timezone: value
    }));
  };
  
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <Link to="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Resource Type</CardTitle>
            <CardDescription>Select what to analyze</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="campaign" onValueChange={handleResourceTypeChange}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="campaign">Campaign</TabsTrigger>
                <TabsTrigger value="url">URL</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Select Resource</CardTitle>
            <CardDescription>
              {filter.type === 'campaign' ? 'Choose a campaign' : 'Choose a URL'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filter.type === 'campaign' ? (
              isLoadingCampaigns ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select onValueChange={(value) => handleResourceSelect(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns?.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id.toString()}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <>
                <div className="mb-2">
                  <Input
                    placeholder="Search URLs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                {isLoadingUrls ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Select onValueChange={(value) => handleResourceSelect(Number(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a URL" />
                    </SelectTrigger>
                    <SelectContent>
                      {urls?.map((url) => (
                        <SelectItem key={url.id} value={url.id.toString()}>
                          {url.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Time Range</CardTitle>
            <CardDescription>Select time period</CardDescription>
          </CardHeader>
          <CardContent>
            <Select defaultValue="today" onValueChange={handleTimeRangeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last_2_days">Last 2 Days</SelectItem>
                <SelectItem value="last_3_days">Last 3 Days</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {filter.timeRange === 'custom' && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                        id="start-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'PPP') : <span>Pick a date</span>}
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
                  <Label htmlFor="end-date">End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left"
                        id="end-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'PPP') : <span>Pick a date</span>}
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
                
                <Button onClick={applyCustomDateRange} disabled={!startDate || !endDate}>
                  Apply Custom Range
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Display Options</CardTitle>
            <CardDescription>Customize analytics view</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-by">Group By</Label>
              <Select defaultValue="day" onValueChange={handleGroupByChange}>
                <SelectTrigger id="group-by">
                  <SelectValue placeholder="Select grouping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select defaultValue="UTC" onValueChange={handleTimezoneChange}>
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((timezone) => (
                    <SelectItem key={timezone} value={timezone}>
                      {timezone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Analytics Results */}
      {!filter.id && (
        <Card className="mb-6">
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <h3 className="text-xl font-medium mb-2">Select a {filter.type} to view analytics</h3>
              <p>Choose from the dropdown above to see detailed analytics data</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {filter.id > 0 && (
        <>
          {isLoadingAnalytics ? (
            <Card className="mb-6">
              <CardContent className="flex items-center justify-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Card */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Analytics Summary</CardTitle>
                  <CardDescription>
                    {analyticsData?.summary.resourceType === 'campaign' ? 'Campaign' : 'URL'}: {analyticsData?.summary.resourceName}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-muted p-4 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Clicks</h3>
                      <p className="text-3xl font-bold">{analyticsData?.summary.totalClicks.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Start Date</h3>
                      <p className="text-lg font-medium">
                        {analyticsData?.summary.dateRangeStart ? new Date(analyticsData.summary.dateRangeStart).toLocaleDateString() : '-'}
                      </p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">End Date</h3>
                      <p className="text-lg font-medium">
                        {analyticsData?.summary.dateRangeEnd ? new Date(analyticsData.summary.dateRangeEnd).toLocaleDateString() : '-'}
                      </p>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Timezone</h3>
                      <p className="text-lg font-medium">{analyticsData?.summary.timezone}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Chart Card */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Analytics Chart</CardTitle>
                  <CardDescription>
                    Click distribution over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="bar">
                    <TabsList className="mb-4">
                      <TabsTrigger value="bar">Bar Chart</TabsTrigger>
                      <TabsTrigger value="line">Line Chart</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="bar">
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analyticsData?.timeseries || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="clicks" fill="#3B82F6" name="Clicks" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="line">
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analyticsData?.timeseries || []}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="period" />
                            <YAxis />
                            <Tooltip />
                            <Line 
                              type="monotone" 
                              dataKey="clicks" 
                              stroke="#3B82F6" 
                              name="Clicks"
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
              
              {/* Data Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Raw Analytics Data</CardTitle>
                  <CardDescription>
                    Detailed analytics data points
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground bg-muted">
                        <tr>
                          <th scope="col" className="px-6 py-3">Period</th>
                          <th scope="col" className="px-6 py-3">Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData?.timeseries.map((item, index) => (
                          <tr key={index} className="border-b">
                            <td className="px-6 py-4 font-medium">{item.period}</td>
                            <td className="px-6 py-4">{item.clicks.toLocaleString()}</td>
                          </tr>
                        ))}
                        {analyticsData?.timeseries.length === 0 && (
                          <tr>
                            <td colSpan={2} className="px-6 py-4 text-center text-muted-foreground">
                              No data available for the selected period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;