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
import { Loader2, ArrowLeft, MousePointer2, Globe2, Clock } from "lucide-react";
import { Campaign, Url, ClickAnalytics } from "@shared/schema";

export default function UrlAnalyticsPage() {
  // Get the URL ID from the URL
  const [, params] = useRoute<{ id: string }>("/analytics/url/:id");
  const urlId = params?.id ? parseInt(params.id, 10) : 0;

  const [timeFilter, setTimeFilter] = useState<string>("total");
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [showHourly, setShowHourly] = useState<boolean>(false);

  // Fetch URL details
  const {
    data: url,
    isLoading: urlLoading,
    error: urlError,
  } = useQuery<Url>({
    queryKey: [`/api/urls/${urlId}`],
    enabled: !!urlId,
  });

  // Fetch campaign if the URL is associated with one
  const {
    data: campaign,
    isLoading: campaignLoading,
    error: campaignError,
  } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${url?.campaignId}`],
    enabled: !!url?.campaignId,
  });

  // We'll fetch click analytics data once the backend API is implemented
  const {
    data: clickAnalytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery<ClickAnalytics[]>({
    queryKey: [`/api/analytics/url/${urlId}`, { timeFilter, timeZone, showHourly }],
    enabled: false, // Disable for now until backend API is available
  });

  const isLoading = urlLoading || (url?.campaignId ? campaignLoading : false) || analyticsLoading;
  const hasError = urlError || (url?.campaignId ? campaignError : false) || analyticsError;

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

  // Calculate completion percentage
  const completionPercent = url ? Math.round((url.clicks / url.clickLimit) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasError || !url) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold text-destructive">Error loading URL data</h1>
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
        <h1 className="text-3xl font-bold">URL Analytics: {url.name}</h1>
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
              <span className="text-3xl font-bold">{url.clicks}</span>
              <MousePointer2 className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Click Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">{url.clickLimit}</span>
              <Globe2 className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-3xl font-bold">{completionPercent}%</span>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div 
                    className="bg-primary h-2.5 rounded-full" 
                    style={{ width: `${Math.min(completionPercent, 100)}%` }}
                  ></div>
                </div>
              </div>
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="time">Time Analysis</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>URL Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                  <p className="text-base">{url.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <p className="text-base capitalize">{url.status}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Target URL</p>
                  <a 
                    href={url.targetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {url.targetUrl}
                  </a>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Campaign</p>
                  <p className="text-base">
                    {campaign ? (
                      <Link href={`/analytics/campaign/${campaign.id}`}>
                        <span className="text-blue-600 hover:underline cursor-pointer">
                          {campaign.name}
                        </span>
                      </Link>
                    ) : (
                      'None'
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p className="text-base">
                    {new Date(url.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Original Click Limit</p>
                  <p className="text-base">{url.originalClickLimit}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Current Click Limit</p>
                  <p className="text-base">{url.clickLimit}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {campaign && (
            <Card>
              <CardHeader>
                <CardTitle>Campaign Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Campaign Name</p>
                    <p className="text-base">{campaign.name}</p>
                  </div>
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
                </div>
                <div className="mt-4">
                  <Link href={`/analytics/campaign/${campaign.id}`}>
                    <Button variant="outline">
                      View Campaign Analytics
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
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
        
        <TabsContent value="geography" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Geographic Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-80 flex items-center justify-center">
              {/* Geographic distribution placeholder */}
              <div className="text-center text-muted-foreground">
                <p>Geographic data will be available soon</p>
                <p className="text-sm">The analytics tracking system is being implemented</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Top Countries</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {/* Top countries placeholder */}
              <div className="text-center text-muted-foreground">
                <p>Country data will be available soon</p>
                <p className="text-sm">The analytics tracking system is being implemented</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}