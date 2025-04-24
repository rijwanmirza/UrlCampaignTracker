import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Loader2, Check, X, RefreshCw, Play, Pause, DollarSign, Calendar } from 'lucide-react';
import { format } from 'date-fns';

// Define schemas for the form validation
const apiKeyFormSchema = z.object({
  apiKey: z.string().min(10, 'API key must be at least 10 characters')
});

const campaignBudgetSchema = z.object({
  maxDaily: z.coerce.number().min(0, 'Budget must be a positive number')
});

const campaignEndTimeSchema = z.object({
  scheduleEndTime: z.string().min(1, 'End time is required')
});

export default function TrafficstarPage() {
  const [activeTab, setActiveTab] = useState<string>('campaigns');
  const queryClient = useQueryClient();
  
  // Check if TrafficStar is configured
  const { 
    data: statusData, 
    isLoading: isStatusLoading 
  } = useQuery({
    queryKey: ['/api/trafficstar/status'],
    refetchOnWindowFocus: false
  });
  
  const isConfigured = statusData?.configured;
  
  // Form for API key submission
  const apiKeyForm = useForm<z.infer<typeof apiKeyFormSchema>>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      apiKey: '',
    },
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

  // Submit handler for API key form
  const onApiKeySubmit = (data: z.infer<typeof apiKeyFormSchema>) => {
    saveApiKeyMutation.mutate(data);
  };

  // Fetch campaigns if configured
  const {
    data: campaigns,
    isLoading: isCampaignsLoading,
    refetch: refetchCampaigns
  } = useQuery({
    queryKey: ['/api/trafficstar/campaigns'],
    enabled: !!isConfigured,
    refetchOnWindowFocus: false
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
      refetchCampaigns();
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
      refetchCampaigns();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update budget',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  });

  // Update campaign end time mutation
  const updateEndTimeMutation = useMutation({
    mutationFn: (data: { campaignId: number, scheduleEndTime: string }) => 
      apiRequest('/api/trafficstar/campaigns/end-time', 'POST', data),
    onSuccess: () => {
      toast({
        title: 'End Time Updated',
        description: 'Campaign end time has been updated successfully.',
      });
      refetchCampaigns();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update end time',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  });

  // Handle campaign pause/activate
  const handleCampaignAction = (campaignId: number, action: 'pause' | 'activate') => {
    campaignActionMutation.mutate({ campaignId, action });
  };

  // Handle budget update form submission
  const handleBudgetUpdate = (campaignId: number, budget: number) => {
    updateBudgetMutation.mutate({ campaignId, maxDaily: budget });
  };

  // Handle end time update form submission
  const handleEndTimeUpdate = (campaignId: number, endTime: string) => {
    updateEndTimeMutation.mutate({ campaignId, scheduleEndTime: endTime });
  };

  // Initialize budget forms for each campaign
  const [budgetForms, setBudgetForms] = useState<Record<number, { form: ReturnType<typeof useForm>, isOpen: boolean }>>({});
  const [endTimeForms, setEndTimeForms] = useState<Record<number, { form: ReturnType<typeof useForm>, isOpen: boolean }>>({});

  useEffect(() => {
    // Set up forms for each campaign when campaigns are loaded
    if (campaigns && campaigns.length > 0) {
      const newBudgetForms: Record<number, { form: ReturnType<typeof useForm>, isOpen: boolean }> = {};
      const newEndTimeForms: Record<number, { form: ReturnType<typeof useForm>, isOpen: boolean }> = {};
      
      campaigns.forEach(campaign => {
        // Budget form
        newBudgetForms[campaign.id] = {
          form: useForm<z.infer<typeof campaignBudgetSchema>>({
            resolver: zodResolver(campaignBudgetSchema),
            defaultValues: {
              maxDaily: campaign.max_daily || 0,
            },
          }),
          isOpen: false
        };

        // End time form
        newEndTimeForms[campaign.id] = {
          form: useForm<z.infer<typeof campaignEndTimeSchema>>({
            resolver: zodResolver(campaignEndTimeSchema),
            defaultValues: {
              scheduleEndTime: campaign.schedule_end_time || '',
            },
          }),
          isOpen: false
        };
      });

      setBudgetForms(newBudgetForms);
      setEndTimeForms(newEndTimeForms);
    }
  }, [campaigns]);

  // Toggle form display
  const toggleBudgetForm = (campaignId: number) => {
    setBudgetForms(prev => ({
      ...prev,
      [campaignId]: {
        ...prev[campaignId],
        isOpen: !prev[campaignId]?.isOpen
      }
    }));
  };

  const toggleEndTimeForm = (campaignId: number) => {
    setEndTimeForms(prev => ({
      ...prev,
      [campaignId]: {
        ...prev[campaignId],
        isOpen: !prev[campaignId]?.isOpen
      }
    }));
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
      
      {!isConfigured ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Enter your TrafficStar API key to start managing campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...apiKeyForm}>
              <form onSubmit={apiKeyForm.handleSubmit(onApiKeySubmit)} className="space-y-4">
                <FormField
                  control={apiKeyForm.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TrafficStar API Key</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter your API key" 
                          {...field} 
                          type="password"
                        />
                      </FormControl>
                      <FormDescription>
                        This key will be used to authenticate with the TrafficStar API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={saveApiKeyMutation.isPending}>
                  {saveApiKeyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save API Key'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
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
                          {budgetForms[campaign.id]?.isOpen && (
                            <Form {...budgetForms[campaign.id].form}>
                              <form 
                                onSubmit={budgetForms[campaign.id].form.handleSubmit((data) => 
                                  handleBudgetUpdate(campaign.id, data.maxDaily)
                                )} 
                                className="mt-2 space-y-2"
                              >
                                <FormField
                                  control={budgetForms[campaign.id].form.control}
                                  name="maxDaily"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <div className="flex space-x-2">
                                          <Input 
                                            type="number" 
                                            step="0.01"
                                            {...field} 
                                          />
                                          <Button type="submit" size="sm" disabled={updateBudgetMutation.isPending}>
                                            {updateBudgetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                          </Button>
                                        </div>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </form>
                            </Form>
                          )}
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
                          {endTimeForms[campaign.id]?.isOpen && (
                            <Form {...endTimeForms[campaign.id].form}>
                              <form 
                                onSubmit={endTimeForms[campaign.id].form.handleSubmit((data) => 
                                  handleEndTimeUpdate(campaign.id, data.scheduleEndTime)
                                )} 
                                className="mt-2 space-y-2"
                              >
                                <FormField
                                  control={endTimeForms[campaign.id].form.control}
                                  name="scheduleEndTime"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <div className="flex space-x-2">
                                          <Input 
                                            type="datetime-local" 
                                            {...field} 
                                          />
                                          <Button type="submit" size="sm" disabled={updateEndTimeMutation.isPending}>
                                            {updateEndTimeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                          </Button>
                                        </div>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </form>
                            </Form>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between pt-2">
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => toggleBudgetForm(campaign.id)}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          {budgetForms[campaign.id]?.isOpen ? 'Cancel' : 'Update Budget'}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => toggleEndTimeForm(campaign.id)}
                        >
                          <Calendar className="h-4 w-4 mr-1" />
                          {endTimeForms[campaign.id]?.isOpen ? 'Cancel' : 'Set End Time'}
                        </Button>
                      </div>
                      
                      <div className="flex space-x-2">
                        {campaign.active ? (
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => handleCampaignAction(campaign.id, 'pause')}
                            disabled={campaignActionMutation.isPending}
                          >
                            {campaignActionMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Pause className="h-4 w-4 mr-1" />
                            )}
                            Pause
                          </Button>
                        ) : (
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleCampaignAction(campaign.id, 'activate')}
                            disabled={campaignActionMutation.isPending}
                          >
                            {campaignActionMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Activate
                          </Button>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No campaigns found.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>API Settings</CardTitle>
                <CardDescription>
                  Manage your TrafficStar API configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-2 flex items-center text-sm">
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                  API key is configured
                </p>
                <Separator className="my-4" />
                <Form {...apiKeyForm}>
                  <form onSubmit={apiKeyForm.handleSubmit(onApiKeySubmit)} className="space-y-4">
                    <FormField
                      control={apiKeyForm.control}
                      name="apiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Update API Key</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter new API key" 
                              {...field} 
                              type="password"
                            />
                          </FormControl>
                          <FormDescription>
                            Leave blank if you don't want to change your API key.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={saveApiKeyMutation.isPending || !apiKeyForm.formState.isDirty}>
                      {saveApiKeyMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        'Update API Key'
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}