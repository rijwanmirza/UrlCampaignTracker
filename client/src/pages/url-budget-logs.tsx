import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { queryClient, apiRequest } from '../lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface UrlBudgetLog {
  urlId: number;
  campaignId: number;
  urlName: string;
  price: string;
  dateTime: string;
}

interface Campaign {
  id: number;
  name: string;
  trafficstarCampaignId: string;
}

export default function UrlBudgetLogs() {
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');

  // Get campaigns with TrafficStar integration
  const { data: campaigns, isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['/api/campaigns'],
    select: (data: any) => data.filter((campaign: any) => campaign.trafficstarCampaignId)
  });

  // Get all URL budget logs
  const {
    data: allLogs,
    isLoading: isLoadingLogs,
    error: logsError,
    refetch: refetchLogs
  } = useQuery({
    queryKey: ['/api/url-budget-logs'],
    queryFn: async () => {
      const response = await fetch('/api/url-budget-logs');
      return response.json();
    },
    enabled: activeTab === 'all'
  });

  // Get campaign-specific logs
  const {
    data: campaignLogs,
    isLoading: isLoadingCampaignLogs,
    error: campaignLogsError,
    refetch: refetchCampaignLogs
  } = useQuery({
    queryKey: ['/api/url-budget-logs', selectedCampaignId],
    queryFn: async () => {
      const response = await fetch(`/api/url-budget-logs/${selectedCampaignId}`);
      return response.json();
    },
    enabled: selectedCampaignId !== 'all' && activeTab === 'campaign'
  });

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'all') {
      refetchLogs();
    } else if (selectedCampaignId !== 'all') {
      refetchCampaignLogs();
    }
  };

  // Handle campaign change
  const handleCampaignChange = (value: string) => {
    setSelectedCampaignId(value);
    if (activeTab === 'campaign' && value !== 'all') {
      refetchCampaignLogs();
    }
  };

  // Handle clear logs for all campaigns
  const handleClearAllLogs = async () => {
    if (!confirm('Are you sure you want to clear all URL budget logs? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/url-budget-logs/clear', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear logs');
      }
      
      toast({
        title: 'Success',
        description: 'All URL budget logs have been cleared.',
        variant: 'default',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/url-budget-logs'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clear URL budget logs.',
        variant: 'destructive',
      });
    }
  };

  // Handle clear logs for specific campaign
  const handleClearCampaignLogs = async () => {
    if (selectedCampaignId === 'all') {
      toast({
        title: 'Error',
        description: 'Please select a specific campaign to clear logs.',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Are you sure you want to clear URL budget logs for campaign ${selectedCampaignId}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/url-budget-logs/${selectedCampaignId}/clear`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear logs');
      }
      
      toast({
        title: 'Success',
        description: `URL budget logs for campaign ${selectedCampaignId} have been cleared.`,
        variant: 'default',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/url-budget-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/url-budget-logs', selectedCampaignId] });
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to clear URL budget logs for campaign ${selectedCampaignId}.`,
        variant: 'destructive',
      });
    }
  };

  // Get the logs to display based on active tab
  const logsToDisplay = activeTab === 'all' ? 
    (allLogs?.logs || []) : 
    (campaignLogs?.logs || []);

  return (
    <div className="container mx-auto px-4 py-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>URL Budget Logs</CardTitle>
              <CardDescription>
                View and manage URL budget calculations for campaigns
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => activeTab === 'all' ? refetchLogs() : refetchCampaignLogs()}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <TabsList>
                <TabsTrigger value="all">All Campaigns</TabsTrigger>
                <TabsTrigger value="campaign">Specific Campaign</TabsTrigger>
              </TabsList>
              
              {activeTab === 'campaign' && (
                <div className="flex items-center gap-2">
                  <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Campaigns</SelectItem>
                      {campaigns?.map((campaign: Campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id.toString()}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleClearCampaignLogs}
                    disabled={selectedCampaignId === 'all'}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Campaign Logs
                  </Button>
                </div>
              )}
              
              {activeTab === 'all' && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleClearAllLogs}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Logs
                </Button>
              )}
            </div>
            
            <TabsContent value="all" className="space-y-4">
              {isLoadingLogs ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : logsError ? (
                <div className="text-center py-4 text-red-500">
                  Error loading URL budget logs
                </div>
              ) : logsToDisplay.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No URL budget logs found
                </div>
              ) : (
                <LogsTable logs={logsToDisplay} />
              )}
            </TabsContent>
            
            <TabsContent value="campaign" className="space-y-4">
              {isLoadingCampaignLogs ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : campaignLogsError ? (
                <div className="text-center py-4 text-red-500">
                  Error loading campaign URL budget logs
                </div>
              ) : selectedCampaignId === 'all' ? (
                <div className="text-center py-8 text-gray-500">
                  Please select a specific campaign to view logs
                </div>
              ) : logsToDisplay.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No URL budget logs found for this campaign
                </div>
              ) : (
                <LogsTable logs={logsToDisplay} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Component for displaying logs in a table
function LogsTable({ logs }: { logs: UrlBudgetLog[] }) {
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL ID</TableHead>
            <TableHead>Campaign ID</TableHead>
            <TableHead>URL Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Date & Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log, index) => (
            <TableRow key={index}>
              <TableCell>{log.urlId}</TableCell>
              <TableCell>{log.campaignId}</TableCell>
              <TableCell className="max-w-xs truncate">{log.urlName}</TableCell>
              <TableCell>${parseFloat(log.price).toFixed(4)}</TableCell>
              <TableCell>{log.dateTime.replace('::', ' ')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}