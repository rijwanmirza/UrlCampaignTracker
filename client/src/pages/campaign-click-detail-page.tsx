import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { format } from "date-fns";
import { Calendar, BarChart, ChevronLeft, Clock, Filter, DownloadCloud } from "lucide-react";

import AppLayout from "../components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { queryClient } from "@/lib/queryClient";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function CampaignClickDetailPage() {
  const [, params] = useRoute('/campaign-click-records/:id');
  const campaignId = params ? parseInt(params.id) : 0;
  
  const [filterType, setFilterType] = useState<string>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [showHourly, setShowHourly] = useState(true);

  // Get campaign details
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}`],
    queryFn: () => fetch(`/api/campaigns/${campaignId}`).then(res => res.json()),
  });

  // Query for campaign click summary with hourly breakdown
  const {
    data: clickSummary,
    isLoading: summaryLoading,
    refetch
  } = useQuery({
    queryKey: [
      `/api/campaign-click-records/summary/${campaignId}`, 
      filterType, 
      showHourly,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString()
    ],
    queryFn: () => {
      let url = `/api/campaign-click-records/summary/${campaignId}?filterType=${filterType}`;
      
      if (showHourly) {
        url += '&showHourly=true';
      }
      
      if (filterType === 'custom_range' && dateRange?.from && dateRange?.to) {
        url += `&startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
      }
      
      return fetch(url).then(res => res.json());
    }
  });

  // Get recent click records for this campaign
  const { data: recentClicks, isLoading: recentLoading } = useQuery({
    queryKey: [`/api/campaign-click-records?campaignId=${campaignId}&limit=10&page=1`],
    queryFn: () => fetch(`/api/campaign-click-records?campaignId=${campaignId}&limit=10&page=1`).then(res => res.json()),
  });

  // Handle filter change
  const handleFilterChange = (value: string) => {
    setFilterType(value);
  };

  // Handle date range selection
  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setFilterType('custom_range');
    }
  };

  // Prepare chart data
  const prepareHourlyChartData = () => {
    if (!clickSummary?.hourlyBreakdown) return [];
    
    // Create an array for all 24 hours, initialized with 0 clicks
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      clicks: 0,
      label: `${i.toString().padStart(2, '0')}:00-${(i + 1).toString().padStart(2, '0')}:00`
    }));
    
    // Update with actual click data
    clickSummary.hourlyBreakdown.forEach(item => {
      const hourIndex = item.hour;
      if (hourIndex >= 0 && hourIndex < 24) {
        hours[hourIndex].clicks = item.clicks;
      }
    });
    
    return hours;
  };

  const chartData = prepareHourlyChartData();

  // Loading state
  const isLoading = campaignLoading || summaryLoading || recentLoading;
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  // Format date ranges for display
  const getDateRangeText = () => {
    switch (filterType) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'last_7_days':
        return 'Last 7 Days';
      case 'this_month':
        return 'This Month';
      case 'last_month':
        return 'Last Month';
      case 'this_year':
        return 'This Year';
      case 'custom_range':
        if (dateRange?.from && dateRange?.to) {
          return `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}`;
        }
        return 'Custom Range';
      case 'total':
        return 'All Time';
      default:
        return 'Selected Period';
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/campaign-click-records">
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{campaign?.name || `Campaign ${campaignId}`}</h1>
            <p className="text-muted-foreground">Click performance analysis</p>
          </div>
        </div>

        {/* Filter card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="mr-2 h-5 w-5" />
              Time Period
            </CardTitle>
            <CardDescription>
              Select a time period to analyze click data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date filter */}
              <div>
                <label className="text-sm font-medium mb-1 block">Time Period</label>
                <Select onValueChange={handleFilterChange} defaultValue={filterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="custom_range">Custom Range</SelectItem>
                    <SelectItem value="total">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom date range */}
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Custom Date Range</label>
                <DatePickerWithRange 
                  date={dateRange}
                  onDateChange={handleDateRangeChange}
                  disabled={filterType !== 'custom_range'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Click Summary</CardTitle>
              <CardDescription>
                {getDateRangeText()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-4">
                <div className="text-5xl font-bold">
                  {clickSummary?.totalClicks || 0}
                </div>
                <div className="text-lg text-muted-foreground mt-2">
                  Total Clicks
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>
                Configuration and status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Redirect Method</p>
                  <p className="font-medium">{campaign?.redirectMethod || "Direct"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Custom Path</p>
                  <p className="font-medium">
                    {campaign?.customPath ? (
                      <Badge variant="outline" className="font-mono">
                        {campaign.customPath}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active URLs</p>
                  <p className="font-medium">
                    {campaign?.urls?.filter(url => url.isActive).length || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {campaign?.createdAt ? format(new Date(campaign.createdAt), 'MMM d, yyyy') : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Hourly breakdown chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart className="mr-2 h-5 w-5" />
              Hourly Click Distribution
            </CardTitle>
            <CardDescription>
              Click distribution by hour of day (00:00-23:59) for {getDateRangeText()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clickSummary?.hourlyBreakdown && chartData.length > 0 ? (
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="label" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                      tickMargin={25}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => [`${value} clicks`, 'Clicks']}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Legend />
                    <Bar 
                      dataKey="clicks" 
                      name="Clicks" 
                      fill="#3b82f6" 
                      radius={[4, 4, 0, 0]}
                    />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10">
                <BarChart className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-lg font-semibold">No hourly data available</h3>
                <p className="text-sm text-muted-foreground">
                  Try selecting a different time period or wait for more click data
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <div className="text-sm text-muted-foreground">
              {clickSummary?.totalClicks || 0} total clicks in this period
            </div>
            <Button variant="outline" size="sm">
              <DownloadCloud className="mr-2 h-4 w-4" />
              Export Data
            </Button>
          </CardFooter>
        </Card>

        {/* Recent clicks */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Click Records</CardTitle>
            <CardDescription>
              Last 10 clicks for this campaign
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentClicks?.records && recentClicks.records.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Time</th>
                      <th className="px-4 py-2 text-left font-medium">URL</th>
                      <th className="px-4 py-2 text-left font-medium">IP Address</th>
                      <th className="px-4 py-2 text-left font-medium">Referer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClicks.records.map((record) => (
                      <tr key={record.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-2">
                          <div className="flex items-center">
                            <Clock className="mr-2 h-3 w-3 text-muted-foreground" />
                            {format(new Date(record.timestamp), 'MMM d, HH:mm:ss')}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {record.urlName || <span className="text-muted-foreground italic">Direct</span>}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">
                          {record.ipAddress || '-'}
                        </td>
                        <td className="px-4 py-2 max-w-xs truncate text-xs">
                          {record.referer || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-muted-foreground">No recent clicks found</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link to={`/campaign-click-records?campaignId=${campaignId}`} className="w-full">
              <Button variant="outline" className="w-full">
                View All Click Records
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </AppLayout>
  );
}