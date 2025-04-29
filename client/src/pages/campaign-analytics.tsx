import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, BarChart3, Activity, Clock } from "lucide-react";
import { Campaign, Url, ClickAnalytics } from "@shared/schema";

export default function CampaignAnalyticsPage() {
  // Get the campaign ID from the URL
  const [, params] = useRoute<{ id: string }>("/analytics/campaign/:id");
  const campaignId = params?.id ? parseInt(params.id, 10) : 0;

  const [timeFilter, setTimeFilter] = useState<string>("total");
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [showHourly, setShowHourly] = useState<boolean>(false);

  // Fetch campaign details
  const {
    data: campaign,
    isLoading: campaignLoading,
    error: campaignError,
  } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  // Fetch URLs for this campaign
  const {
    data: campaignUrls,
    isLoading: urlsLoading,
    error: urlsError,
  } = useQuery<Url[]>({
    queryKey: [`/api/campaigns/${campaignId}/urls`],
    enabled: !!campaignId,
  });

  // We'll fetch click analytics data once the backend API is implemented
  const {
    data: clickAnalytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery<ClickAnalytics[]>({
    queryKey: [`/api/analytics/campaign/${campaignId}`, { timeFilter, timeZone, showHourly }],
    enabled: false, // Disable for now until backend API is available
  });

  const isLoading = campaignLoading || urlsLoading || analyticsLoading;
  const hasError = campaignError || urlsError || analyticsError;

  const timeFilterOptions = [
    { label: "All Time", value: "total" },
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 7 Days", value: "last_7_days" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "This Year", value: "this_year" },
  ];

  const timezoneOptions = [
    { label: "UTC", value: "UTC" },
    { label: "US Eastern", value: "America/New_York" },
    { label: "US Pacific", value: "America/Los_Angeles" },
    { label: "London", value: "Europe/London" },
    { label: "Paris", value: "Europe/Paris" },
    { label: "Tokyo", value: "Asia/Tokyo" },
  ];

  // Calculate campaign stats
  const totalClicks = campaignUrls?.reduce((sum, url) => sum + url.clicks, 0) || 0;
  const totalUrls = campaignUrls?.length || 0;
  const avgClicksPerUrl = totalUrls > 0 ? Math.round(totalClicks / totalUrls) : 0;
  const activeUrls = campaignUrls?.filter(url => url.status === 'active').length || 0;
  const pausedUrls = campaignUrls?.filter(url => url.status === 'paused').length || 0;
  const completedUrls = campaignUrls?.filter(url => url.status === 'completed').length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold text-destructive">Error loading campaign data</h1>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
        <Link href="/analytics">
          <Button variant="link">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Analytics
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/analytics">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Campaign Analytics: {campaign.name}</h1>
      </div>
      
      <div className="flex flex-wrap gap-3 items-center justify-end">
        <Select value={timeFilter} onValueChange={setTimeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time period" />
          </SelectTrigger>
          <SelectContent>
            {timeFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={timeZone} onValueChange={setTimeZone}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="flex items-center space-x-2">
          <label className="text-sm">Show Hourly</label>
          <input 
            type="checkbox" 
            checked={showHourly}
            onChange={() => setShowHourly(!showHourly)}
            className="form-checkbox h-4 w-4 text-primary border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">{totalClicks}</span>
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total URLs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">{totalUrls}</span>
              <Activity className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Avg. Clicks per URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">{avgClicksPerUrl}</span>
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="urls">URLs</TabsTrigger>
          <TabsTrigger value="time">Time Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Active URLs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{activeUrls}</div>
                <div className="text-sm text-muted-foreground">
                  {Math.round((activeUrls / totalUrls) * 100) || 0}% of total
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Paused URLs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pausedUrls}</div>
                <div className="text-sm text-muted-foreground">
                  {Math.round((pausedUrls / totalUrls) * 100) || 0}% of total
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Completed URLs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{completedUrls}</div>
                <div className="text-sm text-muted-foreground">
                  {Math.round((completedUrls / totalUrls) * 100) || 0}% of total
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Redirect Method</p>
                  <p className="text-base">{campaign.redirectMethod}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Multiplier</p>
                  <p className="text-base">{campaign.multiplier}x</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Price Per Thousand</p>
                  <p className="text-base">${campaign.pricePerThousand}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p className="text-base">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {campaign.trafficstarCampaignId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">TrafficStar Campaign ID</p>
                    <p className="text-base">{campaign.trafficstarCampaignId}</p>
                  </div>
                )}
                {campaign.customPath && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Custom Path</p>
                    <p className="text-base">{campaign.customPath}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="urls" className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Target URL</th>
                    <th className="px-6 py-3">Clicks</th>
                    <th className="px-6 py-3">Click Limit</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Completion %</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignUrls?.map((url) => {
                    const completionPercent = Math.round((url.clicks / url.clickLimit) * 100);
                    let statusClass = "px-2 py-1 text-xs rounded ";
                    
                    switch(url.status) {
                      case 'active':
                        statusClass += "bg-green-100 text-green-800";
                        break;
                      case 'paused':
                        statusClass += "bg-yellow-100 text-yellow-800";
                        break;
                      case 'completed':
                        statusClass += "bg-blue-100 text-blue-800";
                        break;
                      case 'deleted':
                        statusClass += "bg-red-100 text-red-800";
                        break;
                      default:
                        statusClass += "bg-gray-100 text-gray-800";
                    }
                    
                    return (
                      <tr key={url.id} className="border-b hover:bg-muted/50">
                        <td className="px-6 py-4 font-medium">{url.name}</td>
                        <td className="px-6 py-4 truncate max-w-[200px]">
                          <a 
                            href={url.targetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {url.targetUrl}
                          </a>
                        </td>
                        <td className="px-6 py-4">{url.clicks}</td>
                        <td className="px-6 py-4">{url.clickLimit}</td>
                        <td className="px-6 py-4">
                          <span className={statusClass}>
                            {url.status.charAt(0).toUpperCase() + url.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                              className="bg-primary h-2.5 rounded-full" 
                              style={{ width: `${Math.min(completionPercent, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-xs mt-1 inline-block">{completionPercent}%</span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/analytics/url/${url.id}`}>
                            <Button variant="outline" size="sm">
                              View Details
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {campaignUrls?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-muted-foreground">
                        No URLs found for this campaign
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="time" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Click Timeline</CardTitle>
            </CardHeader>
            <CardContent className="h-80 flex items-center justify-center">
              {/* Timeline placeholder - we'll implement this when the backend is ready */}
              <div className="text-center text-muted-foreground">
                <p>Click timeline data will be available soon</p>
                <p className="text-sm">The analytics tracking system is being implemented</p>
              </div>
            </CardContent>
          </Card>
          
          {showHourly && (
            <Card>
              <CardHeader>
                <CardTitle>Hourly Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-80 flex items-center justify-center">
                {/* Hourly distribution placeholder */}
                <div className="text-center text-muted-foreground">
                  <p>Hourly distribution data will be available soon</p>
                  <p className="text-sm">The analytics tracking system is being implemented</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}