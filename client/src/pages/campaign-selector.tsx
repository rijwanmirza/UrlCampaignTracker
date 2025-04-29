import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, BarChart3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CampaignSelectorPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('today');
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
  
  // Fetch analytics data
  const { data: analyticsData, isLoading, error } = useQuery({
    queryKey: [`/api/analytics/campaigns`, filterType, timezone],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/campaigns?filterType=${filterType}&timezone=${encodeURIComponent(timezone)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return response.json();
    },
  });
  
  // Filter campaigns based on search term if data is available
  const filteredCampaigns = analyticsData?.campaigns 
    ? analyticsData.campaigns.filter((campaign) => 
        (campaign.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Campaign Analytics</h1>
        <Link href="/analytics">
          <Button variant="outline">
            Back to Analytics Dashboard
          </Button>
        </Link>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Select date range and timezone for campaign analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last_7_days">Last 7 days</SelectItem>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="all_time">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
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
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Campaign Click Data</CardTitle>
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
          ) : filteredCampaigns?.length ? (
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
                  {filteredCampaigns.map((campaign) => (
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
              <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Campaigns Found</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? `No campaigns matching "${searchTerm}"`
                  : 'No campaigns available'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}