import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Mail, RotateCcw, Play, RefreshCw, AlertTriangle, Calendar, Power, Trash } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Config schema with basic validation
const gmailConfigSchema = z.object({
  user: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().int().positive(),
  tls: z.boolean().default(true),
  tlsRejectUnauthorized: z.boolean().default(false),
  whitelistSenders: z.string(), // Comma-separated list
  subjectPattern: z.string().min(1, "Subject pattern is required"),
  orderIdRegex: z.string().min(1, "Order ID regex is required"),
  urlRegex: z.string().min(1, "URL regex is required"),
  quantityRegex: z.string().min(1, "Quantity regex is required"),
  defaultCampaignId: z.coerce.number().int().positive(),
  checkInterval: z.coerce.number().int().positive().default(60000),
  autoDeleteMinutes: z.coerce.number().int().min(0),
});

// Status response schema
type GmailStatus = {
  isRunning: boolean;
  config: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
    tlsOptions?: { rejectUnauthorized: boolean };
    whitelistSenders: string[];
    subjectPattern: string;
    orderIdRegex: string;
    urlRegex: string;
    quantityRegex: string;
    defaultCampaignId: number;
    checkInterval: number;
    autoDeleteMinutes: number;
  };
  emailsProcessed: number;
  initialScanComplete: boolean;
};

// List of campaigns for dropdown
type Campaign = {
  id: number;
  name: string;
};

export default function GmailConfig() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("config");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [fullCleanupDialogOpen, setFullCleanupDialogOpen] = useState(false);
  const [daysToKeep, setDaysToKeep] = useState<string>("30");
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  const [beforeDate, setBeforeDate] = useState<string>("");
  const [afterDate, setAfterDate] = useState<string>("");
  
  // Get current Gmail configuration and status
  const { data: status, isLoading: isLoadingStatus } = useQuery<GmailStatus>({
    queryKey: ["/api/gmail/status"],
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // 30 seconds
  });
  
  // Get campaigns for dropdown
  const { data: campaigns, isLoading: isLoadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
    staleTime: 5000, // 5 seconds
  });
  
  // Form for Gmail configuration
  const form = useForm<z.infer<typeof gmailConfigSchema>>({
    resolver: zodResolver(gmailConfigSchema),
    defaultValues: {
      user: "",
      password: "",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsRejectUnauthorized: false,
      whitelistSenders: "",
      subjectPattern: "New Order Received (#.*)",
      orderIdRegex: "#([0-9]+)",
      urlRegex: "https?://[^\\s]+",
      quantityRegex: "([0-9]+)",
      defaultCampaignId: 1,
      checkInterval: 60000,
      autoDeleteMinutes: 0,
    },
  });
  
  // Update form values when status data is loaded
  useEffect(() => {
    if (status && status.config) {
      form.reset({
        user: status.config.user || "",
        // Don't show the actual password, but set a placeholder
        password: status.config.password ? "••••••••••••••••" : "",
        host: status.config.host || "imap.gmail.com",
        port: status.config.port || 993,
        tls: status.config.tls !== undefined ? status.config.tls : true,
        tlsRejectUnauthorized: status.config.tlsOptions?.rejectUnauthorized !== undefined 
          ? status.config.tlsOptions.rejectUnauthorized 
          : false,
        whitelistSenders: status.config.whitelistSenders 
          ? status.config.whitelistSenders.join(", ") 
          : "",
        subjectPattern: status.config.subjectPattern || "New Order Received (#.*)",
        orderIdRegex: status.config.orderIdRegex || "#([0-9]+)",
        urlRegex: status.config.urlRegex || "https?://[^\\s]+",
        quantityRegex: status.config.quantityRegex || "([0-9]+)",
        defaultCampaignId: status.config.defaultCampaignId || 1,
        checkInterval: status.config.checkInterval || 60000,
        autoDeleteMinutes: status.config.autoDeleteMinutes || 0,
      });
    }
  }, [status, form]);
  
  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gmailConfigSchema>) => {
      // Convert whitelist from comma-separated string to array
      const whitelistSenders = data.whitelistSenders
        .split(',')
        .map(sender => sender.trim())
        .filter(sender => sender.length > 0);
      
      // If the password is all asterisks, don't update it (it's a placeholder)
      const passwordToUpdate = data.password.match(/^[•]+$/) 
        ? undefined 
        : data.password;
      
      const configData = {
        ...data,
        whitelistSenders,
        password: passwordToUpdate,
        tlsOptions: {
          rejectUnauthorized: data.tlsRejectUnauthorized
        }
      } as any;
      
      // Remove the extracted field to avoid sending it separately
      if ('tlsRejectUnauthorized' in configData) {
        delete configData.tlsRejectUnauthorized;
      }
      
      const res = await apiRequest("POST", "/api/gmail/config", configData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration updated",
        description: "Gmail reader configuration has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update configuration",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Start/stop Gmail reader
  const toggleReaderMutation = useMutation({
    mutationFn: async (start: boolean) => {
      const endpoint = start ? "/api/gmail/start" : "/api/gmail/stop";
      const res = await apiRequest("POST", endpoint, {});
      return await res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables ? "Gmail reader started" : "Gmail reader stopped",
        description: variables 
          ? "The Gmail reader has been started and is now monitoring emails."
          : "The Gmail reader has been stopped and is no longer monitoring emails.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/status"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to toggle Gmail reader",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Clean mailbox mutation
  const cleanMailboxMutation = useMutation({
    mutationFn: async (params: { daysToKeep?: number, beforeDate?: string, afterDate?: string }) => {
      const res = await apiRequest("POST", "/api/gmail/clean", params);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Mailbox cleaned",
        description: `Successfully cleaned ${data.deletedCount || 0} processed emails.`,
      });
      setCleanupDialogOpen(false);
      setFullCleanupDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to clean mailbox",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Run cleanup with days parameter
  const runCleanup = () => {
    cleanMailboxMutation.mutate({ daysToKeep: parseInt(daysToKeep, 10) });
  };
  
  // Run cleanup with date range
  const runFullCleanup = () => {
    const params: { beforeDate?: string, afterDate?: string } = {};
    if (beforeDate) params.beforeDate = beforeDate;
    if (afterDate) params.afterDate = afterDate;
    cleanMailboxMutation.mutate(params);
  };
  
  // Submit handler
  function onSubmit(data: z.infer<typeof gmailConfigSchema>) {
    updateConfigMutation.mutate(data);
  }
  
  // Toggle Gmail reader
  function toggleReader() {
    if (status) {
      toggleReaderMutation.mutate(!status.isRunning);
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Gmail Status Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center">
            <Mail className="mr-2 h-5 w-5" />
            <CardTitle>Gmail Reader Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : status ? (
            <div>
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <p className="text-sm font-medium mb-1">Status:</p>
                  <Badge variant={status.isRunning ? "default" : "outline"}>
                    {status.isRunning ? "Running" : "Stopped"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Email:</p>
                  <p className="text-sm">{status.config.user}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Target Campaign:</p>
                  <p className="text-sm">
                    {campaigns?.find(c => c.id === status.config.defaultCampaignId)?.name || 
                     status.config.defaultCampaignId}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Emails Processed:</p>
                  <p className="text-sm">{status.emailsProcessed}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant={status.isRunning ? "destructive" : "default"}
                  size="sm"
                  className="flex items-center"
                  onClick={toggleReader}
                  disabled={toggleReaderMutation.isPending}
                >
                  {toggleReaderMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : status.isRunning ? (
                    <><Power className="mr-2 h-4 w-4" />Stop Reader</>
                  ) : (
                    <><Play className="mr-2 h-4 w-4" />Start Reader</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center"
                  onClick={() => setCleanupDialogOpen(true)}
                >
                  <Trash className="mr-2 h-4 w-4" />
                  Cleanup Processed Emails
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center"
                  onClick={() => setFullCleanupDialogOpen(true)}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Full System Cleanup
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-4 rounded-md bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
              <p className="text-amber-600">
                Gmail reader status not available. Please configure and start the reader.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gmail Configuration Card */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Gmail Configuration</CardTitle>
          <CardDescription>
            Configure Gmail email reader to automatically import URLs from emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="advanced">Email Processing</TabsTrigger>
            </TabsList>
            
            <TabsContent value="config">
              {isLoadingStatus || isLoadingCampaigns ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Credentials</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="user"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gmail Email</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="youraccount@gmail.com" />
                              </FormControl>
                              <FormDescription>
                                Your Gmail account used to receive URLs
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
                                <Input type="password" {...field} placeholder="••••••••••••••••" />
                              </FormControl>
                              <FormDescription>
                                Gmail app password (not your regular Gmail password)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Server Settings</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="host"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>IMAP Host</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="imap.gmail.com" />
                              </FormControl>
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
                                <Input type="number" {...field} placeholder="993" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                  Enable TLS for secure connection (recommended)
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
                          name="tlsRejectUnauthorized"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Reject Unauthorized Certificates
                                </FormLabel>
                                <FormDescription>
                                  Validates server certificates
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
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Email Processing</h3>
                      
                      <FormField
                        control={form.control}
                        name="whitelistSenders"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Whitelist Senders</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="helpdesk@reply.in" />
                            </FormControl>
                            <FormDescription>
                              Comma-separated list of whitelisted sender email addresses or domains
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="defaultCampaignId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Campaign</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  {...field}
                                  value={field.value || ""}
                                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                                >
                                  <option value="">Select default campaign</option>
                                  {campaigns?.map(campaign => (
                                    <option key={campaign.id} value={campaign.id}>
                                      {campaign.name}
                                    </option>
                                  ))}
                                </select>
                              </FormControl>
                              <FormDescription>
                                Default campaign for URLs when no matching assignment rule is found
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
                              <FormLabel>Auto-Delete Minutes</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" {...field} placeholder="0" />
                              </FormControl>
                              <FormDescription>
                                Minutes to wait before deleting processed emails (0 = disabled)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="checkInterval"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Check Interval (ms)</FormLabel>
                            <FormControl>
                              <Input type="number" min="10000" {...field} placeholder="60000" />
                            </FormControl>
                            <FormDescription>
                              How often to check for new emails (in milliseconds)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="flex justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => form.reset()}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reset Form
                      </Button>
                      
                      <Button 
                        type="submit"
                        disabled={updateConfigMutation.isPending}
                      >
                        {updateConfigMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Save Configuration
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </TabsContent>
            
            <TabsContent value="advanced">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Subject Pattern</h3>
                    
                    <FormField
                      control={form.control}
                      name="subjectPattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject Pattern</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="New Order Received (#.*)" />
                          </FormControl>
                          <FormDescription>
                            Regular expression to match email subject
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Order ID Pattern</h3>
                    
                    <FormField
                      control={form.control}
                      name="orderIdRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order ID Regex</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="#([0-9]+)" />
                          </FormControl>
                          <FormDescription>
                            Regex to extract order ID from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">URL Pattern</h3>
                    
                    <FormField
                      control={form.control}
                      name="urlRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL Regex</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https?://[^\\s]+" />
                          </FormControl>
                          <FormDescription>
                            Regex to extract URL from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Quantity Pattern</h3>
                    
                    <FormField
                      control={form.control}
                      name="quantityRegex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity Regex</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="([0-9]+)" />
                          </FormControl>
                          <FormDescription>
                            Regex to extract click quantity from email body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={updateConfigMutation.isPending}
                  >
                    {updateConfigMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Advanced Settings
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Standard Cleanup Dialog */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clean Processed Emails</DialogTitle>
            <DialogDescription>
              This will permanently delete all processed emails that are older than the specified number of days.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <FormItem>
              <FormLabel>Days to Keep</FormLabel>
              <Input
                type="number"
                min="0"
                value={daysToKeep}
                onChange={(e) => setDaysToKeep(e.target.value)}
                className="mt-1"
              />
              <FormDescription>
                Emails processed more than this many days ago will be deleted. 
                Set to 0 to delete all processed emails.
              </FormDescription>
            </FormItem>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={runCleanup}
              disabled={cleanMailboxMutation.isPending}
            >
              {cleanMailboxMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Emails
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Full Cleanup Dialog */}
      <Dialog open={fullCleanupDialogOpen} onOpenChange={setFullCleanupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Full System Cleanup</DialogTitle>
            <DialogDescription>
              This will permanently delete emails matching your criteria from the mailbox.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="use-date-range"
                checked={useCustomDateRange}
                onCheckedChange={setUseCustomDateRange}
              />
              <label htmlFor="use-date-range">Use custom date range</label>
            </div>
            
            {useCustomDateRange ? (
              <div className="grid grid-cols-2 gap-4">
                <FormItem>
                  <FormLabel>After Date</FormLabel>
                  <Input
                    type="date"
                    value={afterDate}
                    onChange={(e) => setAfterDate(e.target.value)}
                    className="mt-1"
                  />
                </FormItem>
                
                <FormItem>
                  <FormLabel>Before Date</FormLabel>
                  <Input
                    type="date"
                    value={beforeDate}
                    onChange={(e) => setBeforeDate(e.target.value)}
                    className="mt-1"
                  />
                </FormItem>
              </div>
            ) : (
              <FormItem>
                <FormLabel>Days to Keep</FormLabel>
                <Input
                  type="number"
                  min="0"
                  value={daysToKeep}
                  onChange={(e) => setDaysToKeep(e.target.value)}
                  className="mt-1"
                />
                <FormDescription>
                  Emails older than this many days will be deleted
                </FormDescription>
              </FormItem>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullCleanupDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={useCustomDateRange ? runFullCleanup : runCleanup}
              disabled={cleanMailboxMutation.isPending}
            >
              {cleanMailboxMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Emails
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}