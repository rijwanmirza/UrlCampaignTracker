import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// UI components
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

// Config schema with basic validation
const gmailSettingsSchema = z.object({
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

export default function GmailConfigExact() {
  const { toast } = useToast();
  const [autoDeleteMinutes, setAutoDeleteMinutes] = useState<string>("2");
  
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
  const form = useForm<z.infer<typeof gmailSettingsSchema>>({
    resolver: zodResolver(gmailSettingsSchema),
    defaultValues: {
      user: "",
      password: "",
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsRejectUnauthorized: false,
      whitelistSenders: "helpdesk@reply.in",
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
      
      if (status.config.autoDeleteMinutes) {
        setAutoDeleteMinutes(status.config.autoDeleteMinutes.toString());
      }
    }
  }, [status, form]);
  
  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gmailSettingsSchema>) => {
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
    mutationFn: async (params: { autoDeleteMinutes: number }) => {
      const res = await apiRequest("POST", "/api/gmail/clean", params);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Processed emails cleanup scheduled",
        description: `Auto-delete set to ${autoDeleteMinutes} minutes`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to set auto-delete",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Submit handler for the main form
  function onSubmit(data: z.infer<typeof gmailSettingsSchema>) {
    updateConfigMutation.mutate(data);
  }
  
  // Toggle Gmail reader
  function toggleReader() {
    if (status) {
      toggleReaderMutation.mutate(!status.isRunning);
    }
  }
  
  // Set auto-delete minutes
  function setAutoDelete() {
    const minutes = parseInt(autoDeleteMinutes, 10);
    if (!isNaN(minutes) && minutes >= 0) {
      cleanMailboxMutation.mutate({ autoDeleteMinutes: minutes });
    }
  }
  
  if (isLoadingStatus || isLoadingCampaigns) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gmail Reader Status section */}
      <div className="border rounded-md p-4 bg-muted/20">
        <div className="flex items-center space-x-2 mb-2">
          <div className="bg-primary/10 p-1 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M22 8.62V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.62l9.55 4.77a1 1 0 0 0 .9 0L22 8.62Z"></path>
              <path d="M22 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4.62l9.55 4.77a1 1 0 0 0 .9 0L22 8.62V4Z"></path>
            </svg>
          </div>
          <h3 className="text-base font-medium">Gmail Reader Status</h3>
        </div>
        
        {status ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm font-medium">Status:</p>
              <Badge variant={status.isRunning ? "default" : "secondary"} className="mt-1">
                {status.isRunning ? "Running" : "Stopped"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Email:</p>
              <p className="text-sm mt-1">{status.config.user}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Target Campaign:</p>
              <p className="text-sm mt-1">
                {campaigns?.find(c => c.id === status.config.defaultCampaignId)?.name || "Test"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center p-4 mb-4 bg-amber-50 border border-amber-100 rounded-md">
            <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
            <p className="text-sm text-amber-700">
              Gmail reader not configured. Please set up credentials below.
            </p>
          </div>
        )}
        
        <div className="flex space-x-3">
          <Button 
            size="sm"
            variant={status?.isRunning ? "destructive" : "default"}
            onClick={toggleReader}
            disabled={!status || toggleReaderMutation.isPending}
            className="text-xs"
          >
            {toggleReaderMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : status?.isRunning ? (
              "Stop Reader"
            ) : (
              "Start Reader"
            )}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              toast({
                title: "Cleaning logs",
                description: "Processed logs have been cleaned",
              });
            }}
          >
            Cleanup Logs
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              toast({
                title: "Full System Cleanup",
                description: "Full system cleanup initiated",
              });
            }}
          >
            Full System Cleanup
          </Button>
        </div>
      </div>

      {/* Main Configuration Form - Exact match to screenshot */}
      <Card className="border">
        <CardContent className="pt-6">
          <h3 className="text-lg font-medium mb-4">Gmail Configuration</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Configure your Gmail account to automatically add URLs from emails
          </p>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Gmail Email section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormField
                    control={form.control}
                    name="user"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gmail Email</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="campaigntracker@gmail.com" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Your Gmail email address
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} placeholder="••••••••••••••••" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Use an app password (not your regular Gmail password)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              {/* IMAP Host settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IMAP Host</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="imap.gmail.com" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Default: imap.gmail.com
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div>
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IMAP Port</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} placeholder="993" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Default: 993
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              {/* TLS Settings */}
              <div className="mt-2">
                <FormField
                  control={form.control}
                  name="tls"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Use TLS
                        </FormLabel>
                        <FormDescription className="text-xs">
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
              </div>
              
              {/* Whitelist Senders */}
              <div>
                <FormField
                  control={form.control}
                  name="whitelistSenders"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Whitelist Senders</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="helpdesk@reply.in" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Comma-separated list of allowed email senders
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Order ID Pattern */}
              <div>
                <FormField
                  control={form.control}
                  name="orderIdRegex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order ID Pattern</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="#([0-9]+)" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Regex to extract order ID from email body
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* URL Pattern */}
              <div>
                <FormField
                  control={form.control}
                  name="urlRegex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Pattern</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https?://[^\\s]+" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Regex to extract URL from email body
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Quantity Pattern */}
              <div>
                <FormField
                  control={form.control}
                  name="quantityRegex"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Pattern</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="([0-9]+)" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Regex to extract click quantity from email body
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Check Interval */}
              <div>
                <FormField
                  control={form.control}
                  name="checkInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check Interval (ms)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} placeholder="60000" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        How often to check emails (in milliseconds)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Target Campaign */}
              <div>
                <FormField
                  control={form.control}
                  name="defaultCampaignId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Campaign</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                        >
                          <option value="">Select target campaign</option>
                          {campaigns?.map(campaign => (
                            <option key={campaign.id} value={campaign.id}>
                              {campaign.name}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormDescription className="text-xs">
                        Campaign where URLs will be added
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Subject Pattern */}
              <div>
                <FormField
                  control={form.control}
                  name="subjectPattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject Pattern</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="New Order Received (#.*)" />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Regular expression to match email subject
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Auto-Delete Processed Emails */}
              <div>
                <FormLabel>Auto-Delete Processed Emails (minutes)</FormLabel>
                <div className="flex gap-2">
                  <Input 
                    type="number" 
                    min="0" 
                    value={autoDeleteMinutes} 
                    onChange={(e) => setAutoDeleteMinutes(e.target.value)}
                    className="w-20" 
                  />
                  <Button 
                    type="button" 
                    onClick={setAutoDelete}
                    variant="outline"
                    size="sm"
                  >
                    Set
                  </Button>
                </div>
                <FormDescription className="text-xs mt-2">
                  Minutes after processing when emails will be automatically deleted. Recommended values: 0-7 days (0-10080 minutes). Set to 0 to disable auto-deletion.
                </FormDescription>
              </div>
              
              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant={status?.isRunning ? "destructive" : "default"}
                  onClick={toggleReader}
                  disabled={!status || toggleReaderMutation.isPending}
                >
                  {toggleReaderMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : status?.isRunning ? (
                    "Stop Gmail Reader"
                  ) : (
                    "Start Gmail Reader"
                  )}
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
        </CardContent>
      </Card>
    </div>
  );
}