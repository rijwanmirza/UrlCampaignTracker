import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function CampaignAnalyticsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [filterType, setFilterType] = useState('today');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [timezone, setTimezone] = useState(() => {
    // Try to get from local storage first
    const savedTimezone = localStorage.getItem('analytics_timezone');
    return savedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  // Save timezone to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('analytics_timezone', timezone);
    
    // Also send to server
    const saveTimezone = async () => {
      try {
        await fetch('/api/analytics/timezone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ timezone }),
        });
      } catch (error) {
        console.error('Failed to save timezone preference:', error);
      }
    };
    
    saveTimezone();
  }, [timezone]);

  // Fetch campaign analytics with filters
  const {
    data: analyticsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [`/api/analytics/campaigns`, filterType, startDate, endDate, timezone],
    queryFn: async () => {
      let url = `/api/analytics/campaigns?filterType=${filterType}&timezone=${encodeURIComponent(timezone)}`;
      
      if (filterType === 'custom_date' && startDate && endDate) {
        url += `&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return response.json();
    },
  });

  const handleFilterChange = (value: string) => {
    setFilterType(value);
    // Clear custom dates if not using custom filter
    if (value !== 'custom_date') {
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleApplyFilter = () => {
    refetch();
  };

  // Format dates for display
  const formatDateRange = () => {
    if (filterType === 'custom_date' && startDate && endDate) {
      return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
    }
    
    const now = new Date();
    
    switch (filterType) {
      case 'today':
        return format(now, 'MMM d, yyyy');
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return format(yesterday, 'MMM d, yyyy');
      case 'this_month':
        return format(now, 'MMMM yyyy');
      case 'last_month':
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        return format(lastMonth, 'MMMM yyyy');
      case 'last_7_days':
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return `${format(sevenDaysAgo, 'MMM d')} - ${format(now, 'MMM d, yyyy')}`;
      case 'all_time':
        return 'All Time';
      default:
        return 'Custom Range';
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Campaign Analytics</h1>
        <Link href="/analytics/campaigns">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
          </Button>
        </Link>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <Select value={filterType} onValueChange={handleFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="custom_date">Custom date range</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {filterType === 'custom_date' && (
              <>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
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
                
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
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
              </>
            )}
            
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Timezone</label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button className="h-10" onClick={handleApplyFilter}>
                Apply Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Campaign Click Data</CardTitle>
            <div className="text-sm text-muted-foreground">
              {formatDateRange()} • {timezone}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-10">
              Failed to load analytics data. Please try again.
            </div>
          ) : analyticsData?.campaigns ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Campaign ID</th>
                    <th className="text-left p-2">Campaign Name</th>
                    <th className="text-right p-2">Total Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.campaigns.map((campaign: any) => (
                    <tr key={campaign.id} className="border-b hover:bg-muted/50">
                      <td className="p-2">{campaign.id}</td>
                      <td className="p-2">{campaign.name}</td>
                      <td className="p-2 text-right font-medium">{campaign.clicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-10">
              <p className="text-muted-foreground">No analytics data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}