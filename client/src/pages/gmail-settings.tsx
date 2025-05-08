import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Mail, Play, Power, RefreshCw, RotateCcw, Save, Trash, Calendar, Plus, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// Campaign assignment schema for form
const campaignAssignmentSchema = z.object({
  campaignId: z.number().int().positive("Please select a campaign"),
  minClickLimit: z.number().int().optional(),
  maxClickLimit: z.number().int().optional(),
  active: z.boolean().default(true)
});

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
  defaultCampaignId: z.number().int().positive("Please select a default campaign"),
  campaignAssignments: z.array(campaignAssignmentSchema).default([]),
  checkInterval: z.number().int().positive().default(60000),
  autoDeleteMinutes: z.number().int().min(0).default(0)
});

type GmailSettingsFormValues = z.infer<typeof gmailSettingsSchema>;
type CampaignAssignmentValues = z.infer<typeof campaignAssignmentSchema>;

export default function GmailSettingsPage() {
  const { toast } = useToast();
  const [readerStatus, setReaderStatus] = useState<{ isRunning: boolean, config: any } | null>(null);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [fullCleanupDialogOpen, setFullCleanupDialogOpen] = useState(false);
  const [daysToKeep, setDaysToKeep] = useState<string>("30");
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  const [beforeDate, setBeforeDate] = useState<string>("");
  const [afterDate, setAfterDate] = useState<string>("");
  
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
      defaultCampaignId: 0, // Initially set to 0, will be properly set from config when loaded
      campaignAssignments: [], // Empty campaign assignments array
      checkInterval: 60000,
      autoDeleteMinutes: 0
    }
  });
  
  // Setup field array for campaign assignments
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "campaignAssignments"
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
        
        // Prepare campaign assignments if they exist in config
        const campaignAssignments = Array.isArray(config.campaignAssignments) 
          ? config.campaignAssignments.map((assignment: any) => ({
              campaignId: assignment.campaignId,
              minClickLimit: assignment.minClickLimit || undefined,
              maxClickLimit: assignment.maxClickLimit || undefined,
              active: assignment.active !== undefined ? assignment.active : true
            }))
          : [];
        
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
          defaultCampaignId: config.defaultCampaignId !== undefined && config.defaultCampaignId !== null ? config.defaultCampaignId : (campaigns.length > 0 ? campaigns[0].id : 0),
          campaignAssignments,
          checkInterval: config.checkInterval || 60000,
          autoDeleteMinutes: config.autoDeleteMinutes || 0
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData, campaigns.length]);
  
  // Update configuration mutation
  const configMutation = useMutation<{message: string, config: any}, Error, GmailSettingsFormValues>({
    mutationFn: (values: GmailSettingsFormValues) => {
      // Split comma-separated whitelist senders into an array
      const whitelistSenders = values.whitelistSenders 
        ? values.whitelistSenders.split(',').map(sender => sender.trim())
        : [];
      
      // Ensure campaign assignments have valid values
      const campaignAssignments = values.campaignAssignments.map(assignment => ({
        ...assignment,
        minClickLimit: assignment.minClickLimit || undefined,
        maxClickLimit: assignment.maxClickLimit || undefined,
        active: assignment.active !== undefined ? assignment.active : true
      }));
      
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
        campaignAssignments, // Add campaign assignments to the config
        checkInterval: values.checkInterval,
        autoDeleteMinutes: values.autoDeleteMinutes
      };
      
      return apiRequest<{message: string, config: any}>('POST', '/api/gmail-reader/config', configData);
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
  
  // Define the credential type
  type CredentialsInput = {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
  };

  // Test connection mutation with properly typed parameters
  const testConnectionMutation = useMutation<
    { success: boolean; message: string },
    Error,
    CredentialsInput
  >({
    mutationFn: (credentials: CredentialsInput) => {
      return apiRequest<{ success: boolean, message: string }>('POST', '/api/gmail-reader/test-connection', credentials);
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
  const startMutation = useMutation<{message: string}, Error, void>({
    mutationFn: () => {
      return apiRequest<{message: string}>('POST', '/api/gmail-reader/start');
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
  const stopMutation = useMutation<{message: string}, Error, void>({
    mutationFn: () => {
      return apiRequest<{message: string}>('POST', '/api/gmail-reader/stop');
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
  
  // Reset tracking system mutation
  const resetTrackingMutation = useMutation<{message: string, details: any}, Error, void>({
    mutationFn: () => {
      return apiRequest<{message: string, details: any}>('POST', '/api/gmail-reader/reset-tracking');
    },
    onSuccess: (data) => {
      toast({
        title: "Tracking Reset Complete",
        description: data.message,
        variant: "success"
      });
      refetchStatus();
    },
    onError: (error) => {
      toast({
        title: "Reset Failed",
        description: "Failed to reset email tracking system",
        variant: "destructive",
      });
      console.error("Gmail tracking reset failed:", error);
    }
  });
  
  // Cleanup logs mutation
  const cleanupLogsMutation = useMutation<
    { message: string, entriesRemoved: number, entriesKept: number },
    Error,
    { beforeDate?: string, afterDate?: string, daysToKeep?: string }
  >({
    mutationFn: (params) => {
      return apiRequest<{ message: string, entriesRemoved: number, entriesKept: number }>(
        'POST', 
        '/api/gmail-reader/cleanup-logs', 
        params
      );
    },
    onSuccess: (data) => {
      toast({
        title: "Logs Cleaned Up",
        description: `Successfully cleaned up email logs: removed ${data.entriesRemoved}, kept ${data.entriesKept}`,
      });
      setCleanupDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Cleanup Failed",
        description: "Failed to clean up email logs",
        variant: "destructive",
      });
      console.error("Gmail logs cleanup failed:", error);
    }
  });
  
  // Full system cleanup mutation
  const fullSystemCleanupMutation = useMutation<
    { 
      message: string, 
      result: {
        campaignsDeleted: number, 
        urlsDeleted: number, 
        originalUrlRecordsDeleted: number,
        youtubeUrlRecordsDeleted: number,
        trafficstarCampaignsDeleted: number,
        urlBudgetLogsDeleted: number,
        urlClickRecordsDeleted: number,
        urlClickLogsDeleted: number,
        campaignClickRecordsDeleted: number,
        emailLogsCleared: boolean,
        emailLogsRemoved: number
      }
    }, 
    Error, 
    { confirmText: string }
  >({
    mutationFn: (params) => {
      return apiRequest<{ 
        message: string, 
        result: {
          campaignsDeleted: number, 
          urlsDeleted: number, 
          originalUrlRecordsDeleted: number,
          youtubeUrlRecordsDeleted: number,
          trafficstarCampaignsDeleted: number,
          urlBudgetLogsDeleted: number,
          urlClickRecordsDeleted: number,
          urlClickLogsDeleted: number,
          campaignClickRecordsDeleted: number,
          emailLogsCleared: boolean,
          emailLogsRemoved: number
        }
      }>(
        'POST', 
        '/api/system/full-cleanup', 
        params
      );
    },
    onSuccess: (data) => {
      const result = data.result;
      const deletedItems = [
        `${result.campaignsDeleted} campaigns`,
        `${result.urlsDeleted} URLs`,
        `${result.originalUrlRecordsDeleted} original URL records`,
        `${result.youtubeUrlRecordsDeleted} YouTube URL records`,
        `${result.trafficstarCampaignsDeleted} TrafficStar campaigns`,
        `${result.urlBudgetLogsDeleted} URL budget logs`,
        `${result.urlClickRecordsDeleted} URL click records`,
        `${result.urlClickLogsDeleted || 0} URL click logs`,
        `${result.campaignClickRecordsDeleted} campaign click records`,
        `${result.emailLogsRemoved} email logs`
      ].join(', ');
      
      toast({
        title: "System Cleanup Complete",
        description: `Successfully deleted: ${deletedItems}`,
      });
      setFullCleanupDialogOpen(false);
      
      // Refresh the campaigns list and other data
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
    },
    onError: (error) => {
      toast({
        title: "System Cleanup Failed",
        description: "Failed to perform system cleanup. Please try again.",
        variant: "destructive",
      });
      console.error("System cleanup failed:", error);
    }
  });
  
  // Handle cleanup logs
  const handleCleanupLogs = () => {
    const params: { beforeDate?: string, afterDate?: string, daysToKeep?: string } = {};
    
    if (useCustomDateRange) {
      if (beforeDate) params.beforeDate = beforeDate;
      if (afterDate) params.afterDate = afterDate;
    } else {
      if (daysToKeep) params.daysToKeep = daysToKeep;
    }
    
    cleanupLogsMutation.mutate(params);
  };
  
  // Handle full system cleanup
  const [confirmText, setConfirmText] = useState("");
  
  const handleFullSystemCleanup = () => {
    if (confirmText !== "DELETE ALL DATA") {
      toast({
        title: "Confirmation Failed",
        description: "Please type 'DELETE ALL DATA' to confirm this destructive action.",
        variant: "destructive",
      });
      return;
    }
    
    fullSystemCleanupMutation.mutate({ confirmText });
  };
  
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
              <Button
                variant="outline"
                size="sm"
                className="bg-gray-50 text-gray-700 border-gray-200 mr-2"
                onClick={() => setCleanupDialogOpen(true)}
              >
                <Trash className="h-4 w-4 mr-2" />
                Cleanup Logs
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="bg-amber-50 text-amber-700 border-amber-200 mr-2"
                onClick={() => resetTrackingMutation.mutate()}
                disabled={resetTrackingMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Tracking
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="bg-amber-50 text-amber-700 border-amber-200 mr-2"
                onClick={() => setFullCleanupDialogOpen(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Full System Cleanup
              </Button>
              
              {readerStatus?.isRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-red-50 text-red-700 border-red-200"
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                >
                  {stopMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Power className="mr-2 h-4 w-4" />
                  )}
                  Stop Gmail Reader
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-green-50 text-green-700 border-green-200"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Start Gmail Reader
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="bg-blue-50 text-blue-700 border-blue-200"
                onClick={() => refetchStatus()}
                disabled={isStatusLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isStatusLoading ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </div>
          
          {/* Status Card */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle>Gmail Reader Status</CardTitle>
              <CardDescription>Current status of the Gmail integration</CardDescription>
            </CardHeader>
            <CardContent>
              {isStatusLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : readerStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={readerStatus.isRunning ? "success" : "destructive"} className="text-xs px-2 py-1">
                      {readerStatus.isRunning ? "RUNNING" : "STOPPED"}
                    </Badge>
                    
                    {readerStatus.config && (
                      <span className="text-sm text-gray-500">
                        Checking every {Math.round(readerStatus.config.checkInterval / 1000)} seconds
                      </span>
                    )}
                    
                    {readerStatus.config && readerStatus.config.autoDeleteMinutes > 0 && (
                      <span className="text-sm text-gray-500">
                        | Auto-delete after {readerStatus.config.autoDeleteMinutes} minutes
                      </span>
                    )}
                  </div>
                  
                  {readerStatus.config && (
                    <div className="text-sm mt-2">
                      <div className="mb-1">
                        <span className="font-semibold text-gray-700">Email Account:</span>{' '}
                        <span className="text-gray-600">{readerStatus.config.user || "Not configured"}</span>
                      </div>
                      
                      <div className="mb-1">
                        <span className="font-semibold text-gray-700">Target Campaign:</span>{' '}
                        <span className="text-gray-600">
                          {campaigns.find(c => c.id === readerStatus.config.defaultCampaignId)?.name || readerStatus.config.defaultCampaignId}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">Unable to retrieve status information</div>
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
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="App password" {...field} />
                          </FormControl>
                          <FormDescription>
                            Use an app-specific password (not your main Gmail password)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Connection Settings */}
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
                            Gmail's IMAP server address
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
                            Gmail's IMAP port (993 for SSL/TLS)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tls"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Use SSL/TLS</FormLabel>
                            <FormDescription>
                              Enable secure connection (recommended)
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    {/* Default Campaign */}
                    <FormField
                      control={form.control}
                      name="defaultCampaignId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Campaign</FormLabel>
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
                            Default campaign where new URLs will be added if no campaign assignments match
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Campaign Assignments */}
                    <div className="col-span-2 mb-4 mt-8">
                      <h3 className="text-lg font-medium mb-2">Campaign Assignments</h3>
                      <p className="text-sm text-gray-500 mb-4">Assign URLs to specific campaigns based on click quantity limits</p>
                      
                      <div className="border rounded-md p-4 mb-4 bg-gray-50">
                        {fields.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            No campaign assignments. Add one below.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {fields.map((field, index) => (
                              <div key={field.id} className="grid grid-cols-1 md:grid-cols-10 gap-4 p-4 border rounded-md bg-white relative">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-2 top-2"
                                  onClick={() => remove(index)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                
                                {/* Campaign Selection */}
                                <div className="md:col-span-4">
                                  <FormField
                                    control={form.control}
                                    name={`campaignAssignments.${index}.campaignId`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Campaign</FormLabel>
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
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                
                                {/* Min Click Limit */}
                                <div className="md:col-span-2">
                                  <FormField
                                    control={form.control}
                                    name={`campaignAssignments.${index}.minClickLimit`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Min Clicks</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            placeholder="Min clicks" 
                                            {...field}
                                            onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                
                                {/* Max Click Limit */}
                                <div className="md:col-span-2">
                                  <FormField
                                    control={form.control}
                                    name={`campaignAssignments.${index}.maxClickLimit`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Max Clicks</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            placeholder="Max clicks" 
                                            {...field}
                                            onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                
                                {/* Active Status */}
                                <div className="md:col-span-2 flex items-end mb-1">
                                  <FormField
                                    control={form.control}
                                    name={`campaignAssignments.${index}.active`}
                                    render={({ field }) => (
                                      <FormItem className="flex flex-row items-center justify-start space-x-3 space-y-0">
                                        <FormControl>
                                          <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                          />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                          <FormLabel>Active</FormLabel>
                                        </div>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="mt-4" 
                          onClick={() => append({ 
                            campaignId: campaigns.length > 0 ? campaigns[0].id : 0, 
                            minClickLimit: undefined,
                            maxClickLimit: undefined,
                            active: true 
                          })}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Campaign Assignment
                        </Button>
                      </div>
                    </div>
                    
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
                    
                    <FormField
                      control={form.control}
                      name="autoDeleteMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Auto-Delete Processed Emails (minutes)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              min="0"
                              max="10080"
                            />
                          </FormControl>
                          <FormDescription>
                            Minutes after processing when emails will be automatically deleted. 
                            Recommended values: 60 (1 hour), 1440 (1 day), 10080 (1 week).
                            Set to 0 to disable auto-deletion.
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
          
          {/* Email Cleanup Dialog */}
          <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Clean Up Email Logs</DialogTitle>
                <DialogDescription>
                  Remove records of processed emails to free up space
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <div className="space-y-4">
                  <div className="flex items-center">
                    <Switch 
                      id="custom-date-range"
                      checked={useCustomDateRange} 
                      onCheckedChange={setUseCustomDateRange}
                      className="mr-2"
                    />
                    <label htmlFor="custom-date-range" className="cursor-pointer">
                      Use custom date range
                    </label>
                  </div>
                  
                  {useCustomDateRange ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          After Date (Optional)
                        </label>
                        <Input 
                          type="date"
                          className="col-span-3"
                          value={afterDate}
                          onChange={(e) => setAfterDate(e.target.value)}
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          Before Date (Optional)
                        </label>
                        <Input 
                          type="date"
                          className="col-span-3"
                          value={beforeDate}
                          onChange={(e) => setBeforeDate(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Keep Logs For Last N Days
                      </label>
                      <Input 
                        type="number"
                        min="0"
                        placeholder="30"
                        value={daysToKeep}
                        onChange={(e) => setDaysToKeep(e.target.value)}
                      />
                      <p className="text-sm text-gray-500 mt-2">
                        Logs older than this many days will be removed. Set to 0 to remove all logs.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCleanupLogs}
                  disabled={cleanupLogsMutation.isPending}
                >
                  {cleanupLogsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Clean Up Logs
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Full System Cleanup Dialog */}
          <Dialog open={fullCleanupDialogOpen} onOpenChange={setFullCleanupDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-red-600">Full System Cleanup</DialogTitle>
                <DialogDescription>
                  This will delete ALL campaigns, URLs, and associated data! This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block text-red-500">
                      Type DELETE ALL DATA to confirm
                    </label>
                    <Input 
                      type="text"
                      placeholder="DELETE ALL DATA"
                      className="border-red-300"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setFullCleanupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleFullSystemCleanup}
                  disabled={fullSystemCleanupMutation.isPending}
                >
                  {fullSystemCleanupMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  )}
                  Delete All Data
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}