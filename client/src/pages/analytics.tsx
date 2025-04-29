import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, BarChart3, LineChart, PieChart } from "lucide-react";
import { Campaign, Url } from "@shared/schema";

export default function AnalyticsPage() {
  const [timeFilter, setTimeFilter] = useState<string>("total");
  const [timeZone, setTimeZone] = useState<string>("UTC");

  // Fetch campaigns
  const {
    data: campaigns,
    isLoading: campaignsLoading,
    error: campaignsError,
  } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  // Fetch URLs
  const {
    data: urls,
    isLoading: urlsLoading,
    error: urlsError,
  } = useQuery<Url[]>({
    queryKey: ["/api/urls"],
  });

  const isLoading = campaignsLoading || urlsLoading;
  const hasError = campaignsError || urlsError;

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold text-destructive">Error loading data</h1>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">{campaigns?.length || 0}</span>
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
              <span className="text-3xl font-bold">{urls?.length || 0}</span>
              <LineChart className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-3xl font-bold">
                {urls?.reduce((total, url) => total + url.clicks, 0) || 0}
              </span>
              <PieChart className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Campaign Analytics</h2>
        
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">URLs</th>
                  <th className="px-6 py-3">Total Clicks</th>
                  <th className="px-6 py-3">Average Clicks</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns?.map((campaign) => {
                  const campaignUrls = urls?.filter(url => url.campaignId === campaign.id) || [];
                  const totalClicks = campaignUrls.reduce((sum, url) => sum + url.clicks, 0);
                  const avgClicks = campaignUrls.length 
                    ? Math.round(totalClicks / campaignUrls.length) 
                    : 0;
                    
                  return (
                    <tr key={campaign.id} className="border-b hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">{campaign.name}</td>
                      <td className="px-6 py-4">{campaignUrls.length}</td>
                      <td className="px-6 py-4">{totalClicks}</td>
                      <td className="px-6 py-4">{avgClicks}</td>
                      <td className="px-6 py-4">
                        <Link href={`/analytics/campaign/${campaign.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                
                {campaigns?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-muted-foreground">
                      No campaigns found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top Performing URLs */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Top Performing URLs</h2>
        
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Campaign</th>
                  <th className="px-6 py-3">Clicks</th>
                  <th className="px-6 py-3">Click Limit</th>
                  <th className="px-6 py-3">Completion %</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {urls
                  ?.sort((a, b) => b.clicks - a.clicks)
                  .slice(0, 5)
                  .map((url) => {
                    const campaign = campaigns?.find(c => c.id === url.campaignId);
                    const completionPercent = Math.round((url.clicks / url.clickLimit) * 100);
                    
                    return (
                      <tr key={url.id} className="border-b hover:bg-muted/50">
                        <td className="px-6 py-4 font-medium">{url.name}</td>
                        <td className="px-6 py-4">{campaign?.name || 'N/A'}</td>
                        <td className="px-6 py-4">{url.clicks}</td>
                        <td className="px-6 py-4">{url.clickLimit}</td>
                        <td className="px-6 py-4">{completionPercent}%</td>
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
                
                {urls?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">
                      No URLs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}