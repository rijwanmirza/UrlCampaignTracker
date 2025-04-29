import { Link, useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, CalendarRange, Globe, ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

type Campaign = {
  id: number;
  name: string;
  clicks: number;
};

type DateRange = {
  start: string;
  end: string;
  filterType: string;
};

type CampaignAnalyticsResponse = {
  campaigns: Campaign[];
  dateRange: DateRange;
  timezone: string;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CampaignAnalyticsPage() {
  const [, setLocation] = useLocation();
  const [timezone, setTimezone] = useState(() => {
    const savedTimezone = localStorage.getItem('analytics-timezone');
    return savedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  
  const [filterType, setFilterType] = useState(() => {
    const savedFilter = localStorage.getItem('analytics-filter-type');
    return savedFilter || 'today';
  });
  
  const { toast } = useToast();
  
  const { data, isLoading, error } = useQuery<CampaignAnalyticsResponse>({
    queryKey: ['/api/analytics/campaigns', filterType, timezone],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/analytics/campaigns?filterType=${filterType}&timezone=${encodeURIComponent(timezone)}`);
      return res.json();
    }
  });
  
  const timezoneMutation = useMutation({
    mutationFn: async (newTimezone: string) => {
      const res = await apiRequest('POST', '/api/analytics/timezone', { timezone: newTimezone });
      return res.json();
    },
    onSuccess: () => {
      localStorage.setItem('analytics-timezone', timezone);
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/campaigns'] });
      toast({
        title: 'Timezone updated',
        description: `Your timezone has been set to ${timezone}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update timezone',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
  
  useEffect(() => {
    localStorage.setItem('analytics-timezone', timezone);
    localStorage.setItem('analytics-filter-type', filterType);
  }, [timezone, filterType]);
  
  const filterOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: 'Last 7 days' },
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
    { value: 'all_time', label: 'All time' },
  ];
  
  // Common timezones
  const timezoneOptions = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'China (CST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { value: Intl.DateTimeFormat().resolvedOptions().timeZone, label: 'Local Browser Time' },
  ];
  
  const totalClicks = data?.campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0) || 0;
  
  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    timezoneMutation.mutate(value);
  };
  
  const handleFilterChange = (value: string) => {
    setFilterType(value);
  };
  
  let dateRangeText = '';
  if (data?.dateRange) {
    const { start, end, filterType } = data.dateRange;
    
    switch (filterType) {
      case 'today':
        dateRangeText = 'Today';
        break;
      case 'yesterday':
        dateRangeText = 'Yesterday';
        break;
      case 'this_month':
        dateRangeText = `This Month (${formatDate(start)} - ${formatDate(end)})`;
        break;
      case 'last_month':
        dateRangeText = `Last Month (${formatDate(start)} - ${formatDate(end)})`;
        break;
      case 'all_time':
        dateRangeText = 'All Time';
        break;
      default:
        dateRangeText = `${formatDate(start)} - ${formatDate(end)}`;
    }
  }
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/analytics')} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          Campaign Click Analytics
        </h1>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <CalendarRange className="h-6 w-6 mr-2" />
            Filters
          </CardTitle>
          <CardDescription>
            Select time period and timezone to view campaign click data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Time Period</label>
              <Select value={filterType} onValueChange={handleFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time period" />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Timezone</label>
              <Select value={timezone} onValueChange={handleTimezoneChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {data?.dateRange && (
            <div className="bg-muted p-3 rounded-md">
              <div className="flex items-center text-sm">
                <CalendarRange className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Showing data for: <strong>{dateRangeText}</strong></span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="h-6 w-6 mr-2" />
            Campaign Click Data
          </CardTitle>
          <CardDescription>
            View click statistics for all campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
              Failed to load campaign data. Please try again.
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4 bg-muted p-3 rounded-md">
                <div>Total Campaigns: <strong>{data?.campaigns.length || 0}</strong></div>
                <div>Total Clicks: <strong>{totalClicks}</strong></div>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign ID</TableHead>
                    <TableHead>Campaign Name</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.campaigns.map(campaign => (
                    <TableRow key={campaign.id}>
                      <TableCell>{campaign.id}</TableCell>
                      <TableCell>{campaign.name}</TableCell>
                      <TableCell className="text-right font-medium">
                        {campaign.clicks}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {data?.campaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                        No click data found for the selected time period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}