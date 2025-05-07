import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, RefreshCw, Play, Pause, DollarSign, Calendar, LineChart, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Define schemas for the form validation
const apiKeyFormSchema = z.object({
  apiKey: z.string().min(10, 'API key must be at least 10 characters')
});

// Schema for direct campaign ID action form
const campaignIdActionSchema = z.object({
  campaignId: z.coerce.number().positive('Campaign ID must be a positive number'),
  action: z.enum(['pause', 'activate'], {
    required_error: 'Please select an action',
  }),
});

// Budget update schema
const campaignBudgetUpdateSchema = z.object({
  campaignId: z.coerce.number().positive('Campaign ID must be a positive number'),
  maxDaily: z.coerce.number().min(0, 'Budget must be a positive number')
});

// Define the campaign type
interface Campaign {
  id: number;
  name: string;
  status: string;
  active: boolean;
  is_archived: boolean;
  max_daily: number;
  pricing_model: string;
  schedule_end_time: string;
  [key: string]: any;
}

// Schema for campaign spent value form
const campaignSpentValueSchema = z.object({
  campaignId: z.coerce.number().positive('Campaign ID must be a positive number'),
  dateFrom: z.string().optional(),
  dateUntil: z.string().optional()
});

// Define the spent value stats type
interface SpentValueStats {
  campaignId: number;
  dateRange: {
    from: string;
    to: string;
  };
  dailyStats: Array<{
    date: string;
    impressions: number;
    clicks: number;
    leads: number;
    price: number;
    ecpm: number;
    ecpc: number;
    ecpa: number;
    ctr: number;
  }>;
  totals: {
    spent: number;
    impressions: number;
    clicks: number;
    leads: number;
    ecpm: number;
    ecpc: number;
    ecpa: number;
    ctr: number;
  };
}

export default function TrafficstarPage() {
  const [activeTab, setActiveTab] = useState<string>('campaigns');
  const queryClient = useQueryClient();
  const [spentValueData, setSpentValueData] = useState<SpentValueStats | null>(null);
  const [isLoadingSpentValue, setIsLoadingSpentValue] = useState(false);
  const [spentValueError, setSpentValueError] = useState<string | null>(null);
  
  // Direct Campaign ID action form 
  const campaignIdActionForm = useForm<z.infer<typeof campaignIdActionSchema>>({
    resolver: zodResolver(campaignIdActionSchema),
    defaultValues: {
      campaignId: undefined,
      action: 'pause',
    },
  });
  
  // Budget update form
  const budgetUpdateForm = useForm<z.infer<typeof campaignBudgetUpdateSchema>>({
    resolver: zodResolver(campaignBudgetUpdateSchema),
    defaultValues: {
      campaignId: 1000866, // Preset this with known campaign ID
      maxDaily: 15.0,
    },
  });
  
  // Campaign spent value form
  const spentValueForm = useForm<z.infer<typeof campaignSpentValueSchema>>({
    resolver: zodResolver(campaignSpentValueSchema),
    defaultValues: {
      campaignId: 995224, // Default campaign ID
      dateFrom: undefined,
      dateUntil: undefined
    },
  });
  
  // Form for API key submission
  const apiKeyForm = useForm<z.infer<typeof apiKeyFormSchema>>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      apiKey: '',
    },
  });
  
  // Check if TrafficStar is configured
  const { 
    data: statusData, 
    isLoading: isStatusLoading 
  } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/trafficstar/status'],
    refetchOnWindowFocus: false
  });
  
  // Always consider configured since we're using environment variables now
  const isConfigured = true;

  // Fetch campaigns if configured
  const {
    data: campaigns,
    isLoading: isCampaignsLoading,
    refetch: refetchCampaigns
  } = useQuery<Campaign[]>({
    queryKey: ['/api/trafficstar/campaigns'],
    enabled: !!isConfigured,
    refetchOnWindowFocus: false
  });

  // Save API key mutation
  const saveApiKeyMutation = useMutation({
    mutationFn: (data: z.infer<typeof apiKeyFormSchema>) => 
      apiRequest('/api/trafficstar/config', 'POST', data),
    onSuccess: () => {
      toast({
        title: 'TrafficStar API Configured',
        description: 'API key has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/trafficstar/status'] });
      apiKeyForm.reset();
    },
    onError: (error) => {
      toast({
        title: 'Failed to save API key',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  });

  // Pause/activate campaign mutation
  const campaignActionMutation = useMutation({
    mutationFn: (data: { campaignId: number, action: 'pause' | 'activate' }) => 
      apiRequest('/api/trafficstar/campaigns/action', 'POST', data),
    onSuccess: () => {
      toast({
        title: 'Campaign Updated',
        description: 'Campaign status has been updated successfully.',
      });
      // Force immediate refetch with no cache
      queryClient.invalidateQueries({ queryKey: ['/api/trafficstar/campaigns'] });
      setTimeout(() => {
        refetchCampaigns();
      }, 1000); // Add additional refetch with delay to ensure updated data
    },
    onError: (error) => {
      toast({
        title: 'Failed to update campaign',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  });

  // Update campaign budget mutation
  const updateBudgetMutation = useMutation({
    mutationFn: (data: { campaignId: number, maxDaily: number }) => 
      apiRequest('/api/trafficstar/campaigns/budget', 'POST', data),
    onSuccess: () => {
      toast({
        title: 'Budget Updated',
        description: 'Campaign daily budget has been updated successfully.',
      });
      // Force immediate refetch with no cache
      queryClient.invalidateQueries({ queryKey: ['/api/trafficstar/campaigns'] });
      setTimeout(() => {
        refetchCampaigns();
      }, 1000); // Add additional refetch with delay to ensure updated data
    },
    onError: (error) => {
      toast({
        title: 'Failed to update budget',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  });

  // Submit handler for API key form
  const onApiKeySubmit = (data: z.infer<typeof apiKeyFormSchema>) => {
    saveApiKeyMutation.mutate(data);
  };

  // Handle campaign pause/activate
  const handleCampaignAction = (campaignId: number, action: 'pause' | 'activate') => {
    campaignActionMutation.mutate({ campaignId, action });
  };

  // Submit handler for direct campaign ID action form
  const onCampaignIdActionSubmit = (data: z.infer<typeof campaignIdActionSchema>) => {
    campaignActionMutation.mutate({ 
      campaignId: data.campaignId, 
      action: data.action 
    });
    
    // Reset the form fields after submission
    campaignIdActionForm.reset({
      campaignId: null as any, // Use null as any to avoid TypeScript error
      action: data.action  // Keep the selected action
    });
  };
  
  // Submit handler for budget update form
  const onBudgetUpdateSubmit = (data: z.infer<typeof campaignBudgetUpdateSchema>) => {
    updateBudgetMutation.mutate({ 
      campaignId: data.campaignId, 
      maxDaily: data.maxDaily 
    });
  };
  
  // Submit handler for spent value form
  const onSpentValueSubmit = async (data: z.infer<typeof campaignSpentValueSchema>) => {
    // Reset previous data
    setSpentValueData(null);
    setSpentValueError(null);
    setIsLoadingSpentValue(true);
    
    try {
      // Construct query parameters
      const params = new URLSearchParams();
      if (data.dateFrom) params.append('dateFrom', data.dateFrom);
      if (data.dateUntil) params.append('dateUntil', data.dateUntil);
      
      // Fetch spent value data
      const response = await fetch(`/api/trafficstar/campaigns/${data.campaignId}/spent?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch spent value data');
      }
      
      const spentData: SpentValueStats = await response.json();
      setSpentValueData(spentData);
      
      toast({
        title: 'Spent Value Data Retrieved',
        description: `Successfully fetched data for campaign ${data.campaignId}`,
      });
    } catch (error) {
      setSpentValueError(error instanceof Error ? error.message : 'An unknown error occurred');
      
      toast({
        title: 'Failed to Fetch Spent Value',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpentValue(false);
    }
  };

  // Render loading state
  if (isStatusLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading TrafficStar status...</span>
      </div>
    );
  }
  
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">TrafficStar API Integration</h1>
      
      {/* Campaign Direct Control Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Direct Campaign Control</CardTitle>
          <CardDescription>
            Pause or activate a campaign by entering its ID
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...campaignIdActionForm}>
            <form onSubmit={campaignIdActionForm.handleSubmit(onCampaignIdActionSubmit)} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <FormField
                  control={campaignIdActionForm.control}
                  name="campaignId"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Campaign ID</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Enter campaign ID" 
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={campaignIdActionForm.control}
                  name="action"
                  render={({ field }) => (
                    <FormItem className="md:w-1/3">
                      <FormLabel>Action</FormLabel>
                      <FormControl>
                        <select 
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          {...field}
                        >
                          <option value="pause">Pause Campaign</option>
                          <option value="activate">Activate Campaign</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex items-end mb-2">
                  <Button type="submit" disabled={campaignActionMutation.isPending} className="w-full md:w-auto">
                    {campaignActionMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Apply Action'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* Budget Update Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Update Campaign Budget</CardTitle>
          <CardDescription>
            Set the daily budget for a campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...budgetUpdateForm}>
            <form onSubmit={budgetUpdateForm.handleSubmit(onBudgetUpdateSubmit)} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <FormField
                  control={budgetUpdateForm.control}
                  name="campaignId"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Campaign ID</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Enter campaign ID" 
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={budgetUpdateForm.control}
                  name="maxDaily"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Daily Budget</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Enter daily budget" 
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex items-end mb-2">
                  <Button type="submit" disabled={updateBudgetMutation.isPending} className="w-full md:w-auto">
                    {updateBudgetMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Update Budget'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* Get Spent Value Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Get Campaign Spent Value</CardTitle>
          <CardDescription>
            Retrieve campaign costs and performance statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...spentValueForm}>
            <form onSubmit={spentValueForm.handleSubmit(onSpentValueSubmit)} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <FormField
                  control={spentValueForm.control}
                  name="campaignId"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Campaign ID</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Enter campaign ID" 
                          {...field}
                          value={field.value === undefined ? '' : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={spentValueForm.control}
                  name="dateFrom"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>From Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          placeholder="YYYY-MM-DD" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Start date (defaults to 7 days ago)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={spentValueForm.control}
                  name="dateUntil"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Until Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          placeholder="YYYY-MM-DD" 
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        End date (defaults to today)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex items-end mb-2">
                  <Button type="submit" disabled={isLoadingSpentValue} className="w-full md:w-auto">
                    {isLoadingSpentValue ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <LineChart className="mr-2 h-4 w-4" />
                        Get Spent Value
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
          
          {/* Spent Value Results */}
          {spentValueError && (
            <div className="mt-4 p-4 border border-red-200 rounded-md bg-red-50 text-red-700 flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold">Error retrieving data</h4>
                <p>{spentValueError}</p>
              </div>
            </div>
          )}
          
          {spentValueData && spentValueData.totals && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Campaign Spend Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 border rounded-md">
                  <div className="text-sm text-muted-foreground">Total Spent</div>
                  <div className="text-2xl font-bold">${spentValueData.totals.spent?.toFixed(2) || '0.00'}</div>
                </div>
                <div className="p-4 border rounded-md">
                  <div className="text-sm text-muted-foreground">Impressions</div>
                  <div className="text-2xl font-bold">{spentValueData.totals.impressions?.toLocaleString() || '0'}</div>
                </div>
                <div className="p-4 border rounded-md">
                  <div className="text-sm text-muted-foreground">Clicks</div>
                  <div className="text-2xl font-bold">{spentValueData.totals.clicks?.toLocaleString() || '0'}</div>
                </div>
                <div className="p-4 border rounded-md">
                  <div className="text-sm text-muted-foreground">eCPM</div>
                  <div className="text-2xl font-bold">${spentValueData.totals.ecpm?.toFixed(4) || '0.0000'}</div>
                </div>
              </div>
              
              <h4 className="font-medium mb-2">Daily Statistics</h4>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">Cost (USD)</TableHead>
                      <TableHead className="text-right">eCPM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!spentValueData.dailyStats || spentValueData.dailyStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4">
                          No data available for the selected date range
                        </TableCell>
                      </TableRow>
                    ) : (
                      spentValueData.dailyStats.map((day, index) => (
                        <TableRow key={index}>
                          <TableCell>{day.date ? new Date(day.date).toLocaleDateString() : 'N/A'}</TableCell>
                          <TableCell className="text-right">{day.impressions?.toLocaleString() || '0'}</TableCell>
                          <TableCell className="text-right">{day.clicks?.toLocaleString() || '0'}</TableCell>
                          <TableCell className="text-right">{day.ctr?.toFixed(2) || '0.00'}%</TableCell>
                          <TableCell className="text-right">${(day.price ? parseFloat(day.price.toString()) : 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${(day.ecpm ? parseFloat(day.ecpm.toString()) : 0).toFixed(4)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                Date range: {spentValueData.dateRange?.from || 'N/A'} to {spentValueData.dateRange?.to || 'N/A'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="settings">API Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="campaigns" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">TrafficStar Campaigns</h2>
            <Button
              onClick={() => refetchCampaigns()}
              variant="outline"
              size="sm"
              disabled={isCampaignsLoading}
            >
              {isCampaignsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
          
          {isCampaignsLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span>Loading campaigns...</span>
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl">{campaign.name}</CardTitle>
                      <Badge variant={campaign.active ? "default" : "secondary"}>
                        {campaign.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <CardDescription>ID: {campaign.id} • Status: {campaign.status}</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Daily Budget</Label>
                        <div className="text-lg font-medium">${campaign.max_daily || 0}</div>
                      </div>
                      
                      <div>
                        <Label className="text-sm text-muted-foreground">Pricing Model</Label>
                        <div className="text-lg font-medium">{campaign.pricing_model || 'Not set'}</div>
                      </div>
                      
                      <div>
                        <Label className="text-sm text-muted-foreground">End Time</Label>
                        <div className="text-lg font-medium">
                          {campaign.schedule_end_time 
                            ? format(new Date(campaign.schedule_end_time), 'PPP, p')
                            : 'Not set'
                          }
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      {campaign.active ? (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCampaignAction(campaign.id, 'pause')}
                          disabled={campaignActionMutation.isPending}
                        >
                          <Pause className="h-4 w-4 mr-2" />
                          Pause
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCampaignAction(campaign.id, 'activate')}
                          disabled={campaignActionMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Pre-fill the budget update form with this campaign's data
                          budgetUpdateForm.reset({
                            campaignId: campaign.id,
                            maxDaily: campaign.max_daily || 0
                          });
                          // Switch to top of page
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Update Budget
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No Campaigns Found</CardTitle>
                <CardDescription>
                  Unable to retrieve campaign data or no campaigns exist.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => refetchCampaigns()} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Campaigns
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Status</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-600 font-medium flex items-center">
                <span className="bg-green-600 text-white rounded-full p-1 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                API key is configured
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Your TrafficStar API key is stored securely as an environment variable.
                You can manage your TrafficStar campaigns directly from this interface.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}