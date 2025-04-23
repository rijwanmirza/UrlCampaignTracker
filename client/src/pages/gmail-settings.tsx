import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, Play, Power, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@shared/schema";

// Define Gmail settings form schema
const gmailSettingsSchema = z.object({
  user: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  host: z.string().default('imap.gmail.com'),
  port: z.number().int().positive().default(993),
  tls: z.boolean().default(true),
  whitelistSenders: z.string().optional(),
  subjectPattern: z.string().min(1, "Subject pattern is required"),
  orderIdRegex: z.string().min(1, "Order ID regex is required"),
  urlRegex: z.string().min(1, "URL regex is required"),
  quantityRegex: z.string().min(1, "Quantity regex is required"),
  defaultCampaignId: z.number().int().positive("Please select a campaign"),
  checkInterval: z.number().int().positive().default(60000)
});

type GmailSettingsFormValues = z.infer<typeof gmailSettingsSchema>;

export default function GmailSettingsPage() {
  const { toast } = useToast();
  const [readerStatus, setReaderStatus] = useState<{ isRunning: boolean, config: any } | null>(null);
  
  // Fetch campaigns for the campaign selector
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });
  
  // Get Gmail reader status
  const { data: statusData, isLoading: isStatusLoading, refetch: refetchStatus } = useQuery<{ isRunning: boolean, config: any }>({
    queryKey: ['/api/gmail-reader/status'],
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5000,
  });
  
  // Update config when status data is loaded
  useEffect(() => {
    if (statusData) {
      setReaderStatus(statusData);
      
      // If there's an existing configuration, initialize the form
      if (statusData.config) {
        const config = statusData.config;
        
        // Convert the regex patterns back to strings if they exist
        const whitelistSenders = config.whitelistSenders && config.whitelistSenders.length > 0 
          ? config.whitelistSenders.join(',') 
          : '';
          
        const subjectPattern = config.subjectPattern instanceof RegExp 
          ? config.subjectPattern.toString().slice(1, -1) 
          : (typeof config.subjectPattern === 'string' ? config.subjectPattern : '');
          
        const messagePattern = config.messagePattern || {};
        
        form.reset({
          user: config.user || '',
          password: '', // Don't pre-fill password
          host: config.host || 'imap.gmail.com',
          port: config.port || 993,
          tls: config.tls !== undefined ? config.tls : true,
          whitelistSenders,
          subjectPattern,
          orderIdRegex: messagePattern.orderIdRegex ? messagePattern.orderIdRegex.toString().slice(1, -1) : 'Order Id\\s*:\\s*(\\d+)',
          urlRegex: messagePattern.urlRegex ? messagePattern.urlRegex.toString().slice(1, -1) : 'Url\\s*:\\s*(https?:\\/\\/[^\\s]+)',
          quantityRegex: messagePattern.quantityRegex ? messagePattern.quantityRegex.toString().slice(1, -1) : 'Quantity\\s*:\\s*(\\d+)',
          defaultCampaignId: config.defaultCampaignId || (campaigns.length > 0 ? campaigns[0].id : 0),
          checkInterval: config.checkInterval || 60000
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData, campaigns.length]);
  
  // Form definition
  const form = useForm<GmailSettingsFormValues>({
    resolver: zodResolver(gmailSettingsSchema),
    defaultValues: {
      user: '',
      password: '',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      whitelistSenders: '',
      subjectPattern: 'New Order Received (\\d+)',
      orderIdRegex: 'Order Id\\s*:\\s*(\\d+)',
      urlRegex: 'Url\\s*:\\s*(https?:\\/\\/[^\\s]+)',
      quantityRegex: 'Quantity\\s*:\\s*(\\d+)',
      defaultCampaignId: campaigns.length > 0 ? campaigns[0].id : 0,
      checkInterval: 60000
    }
  });
  
  // Update configuration mutation
  const configMutation = useMutation({
    mutationFn: async (values: GmailSettingsFormValues) => {
      // Split comma-separated whitelist senders into an array
      const whitelistSenders = values.whitelistSenders 
        ? values.whitelistSenders.split(',').map(sender => sender.trim())
        : [];
      
      // Format the data for the API
      const configData = {
        user: values.user,
        password: values.password,
        host: values.host,
        port: values.port,
        tls: values.tls,
        whitelistSenders,
        subjectPattern: values.subjectPattern,
        messagePattern: {
          orderIdRegex: values.orderIdRegex,
          urlRegex: values.urlRegex,
          quantityRegex: values.quantityRegex
        },
        defaultCampaignId: values.defaultCampaignId,
        checkInterval: values.checkInterval
      };
      
      return apiRequest('POST', '/api/gmail-reader/config', configData);
    },
    onSuccess: () => {
      toast({
        title: "Configuration Updated",
        description: "Gmail reader configuration has been updated successfully",
      });
      refetchStatus();
    },
    onError: (error) => {
      toast({
        title: "Configuration Failed",
        description: "Failed to update Gmail reader configuration",
        variant: "destructive",
      });
      console.error("Gmail reader config update failed:", error);
    }
  });
  
  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (values: { user: string, password: string, host: string, port: number, tls: boolean }) => {
      return apiRequest('POST', '/api/gmail-reader/test-connection', values);
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connection Successful",
          description: data.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Connection Test Failed",
        description: "Failed to test Gmail connection",
        variant: "destructive",
      });
      console.error("Gmail connection test failed:", error);
    }
  });
  
  // Handler for test connection button
  const handleTestConnection = () => {
    const values = form.getValues();
    
    if (!values.user || !values.password) {
      toast({
        title: "Missing Credentials",
        description: "Please provide both email and password to test the connection",
        variant: "destructive",
      });
      return;
    }
    
    testConnectionMutation.mutate({
      user: values.user,
      password: values.password,
      host: values.host,
      port: values.port,
      tls: values.tls
    });
  };
  
  // Start Gmail reader mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/gmail-reader/start');
    },
    onSuccess: () => {
      toast({
        title: "Gmail Reader Started",
        description: "Gmail reader has been started successfully",
      });
      refetchStatus();
    },
    onError: (error) => {
      toast({
        title: "Start Failed",
        description: "Failed to start Gmail reader",
        variant: "destructive",
      });
      console.error("Gmail reader start failed:", error);
    }
  });
  
  // Stop Gmail reader mutation
  const stopMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/gmail-reader/stop');
    },
    onSuccess: () => {
      toast({
        title: "Gmail Reader Stopped",
        description: "Gmail reader has been stopped successfully",
      });
      refetchStatus();
    },
    onError: (error) => {
      toast({
        title: "Stop Failed",
        description: "Failed to stop Gmail reader",
        variant: "destructive",
      });
      console.error("Gmail reader stop failed:", error);
    }
  });
  
  // Form submit handler
  const onSubmit = (values: GmailSettingsFormValues) => {
    configMutation.mutate(values);
  };
  
  return (
    <div className="min-h-screen">
      <main className="flex-1 overflow-y-auto bg-gray-50" style={{ paddingBottom: '5rem' }}>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Gmail Reader Settings</h1>
              <p className="text-sm text-gray-500">Configure automatic URL import from Gmail</p>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-2">
              {readerStatus?.isRunning ? (
                <Button 
                  variant="outline" 
                  className="bg-red-50 text-red-600 border-red-200"
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                >
                  {stopMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4 mr-2" />
                  )}
                  Stop Reader
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  className="bg-green-50 text-green-600 border-green-200"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Reader
                </Button>
              )}
            </div>
          </div>
          
          {/* Status Card */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Mail className="h-5 w-5 mr-2" />
                Gmail Reader Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isStatusLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-4">
                  <div>
                    <span className="font-semibold text-gray-700">Status:</span>{' '}
                    {readerStatus?.isRunning ? (
                      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                        Running
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                        Stopped
                      </Badge>
                    )}
                  </div>
                  {readerStatus?.config?.user && (
                    <div>
                      <span className="font-semibold text-gray-700">Email:</span>{' '}
                      <span className="text-gray-600">{readerStatus.config.user}</span>
                    </div>
                  )}
                  {readerStatus?.config?.defaultCampaignId && (
                    <div>
                      <span className="font-semibold text-gray-700">Target Campaign:</span>{' '}
                      <span className="text-gray-600">
                        {campaigns.find(c => c.id === readerStatus.config.defaultCampaignId)?.name || readerStatus.config.defaultCampaignId}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Configuration Form */}
          <Card>
            <CardHeader>
              <CardTitle>Gmail Configuration</CardTitle>
              <CardDescription>
                Configure your Gmail account to automatically add URLs from emails
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form 
                  onSubmit={form.handleSubmit(onSubmit)} 
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Email & Password */}
                    <FormField
                      control={form.control}
                      name="user"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gmail Email</FormLabel>
                          <FormControl>
                            <Input placeholder="example@gmail.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            Your Gmail email address
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>App Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••••••••••" {...field} />
                          </FormControl>
                          <FormDescription>
                            Use an app password (not your regular Gmail password)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* IMAP Settings */}
                    <FormField
                      control={form.control}
                      name="host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IMAP Host</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            Default: imap.gmail.com
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IMAP Port</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Default: 993
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tls"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              Use TLS
                            </FormLabel>
                            <FormDescription>
                              Use secure TLS connection (recommended)
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="defaultCampaignId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Campaign</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(Number(value))}
                            defaultValue={field.value?.toString()}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a campaign" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {campaigns.map((campaign) => (
                                <SelectItem key={campaign.id} value={campaign.id.toString()}>
                                  {campaign.name} (ID: {campaign.id})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Campaign where new URLs will be added
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Patterns */}
                    <FormField
                      control={form.control}
                      name="whitelistSenders"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Whitelist Senders</FormLabel>
                          <FormControl>
                            <Input placeholder="sender@example.com,support@domain.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            Comma-separated list of allowed email senders
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="subjectPattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject Pattern</FormLabel>
                          <FormControl>
                            <Input placeholder="New Order Received (\d+)" {...field} />
                          </FormControl>
                          <FormDescription>
                            Regular expression to match email subject
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="orderIdRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order ID Pattern</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            Regex to extract order ID from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="urlRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL Pattern</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            Regex to extract URL from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="quantityRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Pattern</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            Regex to extract click limit from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="checkInterval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Check Interval (ms)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            How often to check emails (default: 60000 ms = 1 minute)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <CardFooter className="px-0 flex justify-between">
                    <Button 
                      type="button"
                      variant="outline"
                      className="mr-2"
                      onClick={handleTestConnection}
                      disabled={testConnectionMutation.isPending}
                    >
                      {testConnectionMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      Check Configuration
                    </Button>
                    
                    <Button 
                      type="submit" 
                      className="w-full md:w-auto"
                      disabled={configMutation.isPending}
                    >
                      {configMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <Save className="mr-2 h-4 w-4" />
                      Save Configuration
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}