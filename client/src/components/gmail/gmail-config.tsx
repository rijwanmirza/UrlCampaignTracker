import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
    defaultCampaignId: number;
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
      subjectPattern: "",
      orderIdRegex: "",
      urlRegex: "",
      quantityRegex: "",
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
        subjectPattern: status.config.subjectPattern || "",
        orderIdRegex: status.config.orderIdRegex || "",
        urlRegex: status.config.urlRegex || "",
        quantityRegex: status.config.quantityRegex || "",
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
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gmail Configuration</CardTitle>
            <CardDescription>
              Configure the Gmail reader to automatically import URLs from emails.
            </CardDescription>
          </div>
          {status && (
            <Badge variant={status.isRunning ? "default" : "secondary"}>
              {status.isRunning ? "Running" : "Stopped"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="config" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
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
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Gmail account used to receive URLs
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
                              <Input type="password" {...field} />
                            </FormControl>
                            <FormDescription>
                              Gmail app password (not your regular password)
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
                              <Input {...field} />
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
                              <Input type="number" {...field} />
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
                                Enable TLS for secure connection
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
                            <Input {...field} />
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
                        name="subjectPattern"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subject Pattern</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Text pattern to match in email subject line
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
                              <Input type="number" min="10000" {...field} />
                            </FormControl>
                            <FormDescription>
                              How often to check for new emails (in milliseconds)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="orderIdRegex"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Order ID Regex</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Regular expression to extract order ID
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
                            <FormLabel>URL Regex</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Regular expression to extract URL
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="quantityRegex"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity Regex</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>
                              Regular expression to extract click quantity
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
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
                              <Input type="number" min="0" {...field} />
                            </FormControl>
                            <FormDescription>
                              Minutes to wait before deleting processed emails (0 = disabled)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between">
                    <Button
                      type="button"
                      variant={status?.isRunning ? "destructive" : "default"}
                      onClick={toggleReader}
                      disabled={toggleReaderMutation.isPending}
                    >
                      {toggleReaderMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {status?.isRunning ? "Stop Gmail Reader" : "Start Gmail Reader"}
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
          
          <TabsContent value="status">
            {isLoadingStatus ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : status ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium">Status</h3>
                    <p className="text-lg mt-1">
                      {status.isRunning ? (
                        <span className="text-green-600 font-medium">Running</span>
                      ) : (
                        <span className="text-gray-500">Stopped</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium">Emails Processed</h3>
                    <p className="text-lg mt-1">{status.emailsProcessed}</p>
                  </div>
                  
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium">Initial Scan</h3>
                    <p className="text-lg mt-1">
                      {status.initialScanComplete ? (
                        <span className="text-green-600 font-medium">Complete</span>
                      ) : (
                        <span className="text-amber-500">In Progress</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-medium">Auto-Delete</h3>
                    <p className="text-lg mt-1">
                      {status.config.autoDeleteMinutes > 0 ? (
                        <span className="text-green-600 font-medium">
                          Enabled ({status.config.autoDeleteMinutes} minutes)
                        </span>
                      ) : (
                        <span className="text-gray-500">Disabled</span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="rounded-lg border p-4">
                  <h3 className="text-sm font-medium">Current Configuration</h3>
                  <div className="mt-2 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2">
                      <div>
                        <span className="font-medium">Email:</span>{" "}
                        {status.config.user}
                      </div>
                      <div>
                        <span className="font-medium">IMAP Server:</span>{" "}
                        {status.config.host}:{status.config.port}
                      </div>
                      <div>
                        <span className="font-medium">TLS:</span>{" "}
                        {status.config.tls ? "Enabled" : "Disabled"}
                      </div>
                      <div>
                        <span className="font-medium">Default Campaign:</span>{" "}
                        {status.config.defaultCampaignId}
                      </div>
                      <div className="md:col-span-2">
                        <span className="font-medium">Whitelist Senders:</span>{" "}
                        {status.config.whitelistSenders && status.config.whitelistSenders.length > 0
                          ? status.config.whitelistSenders.join(", ")
                          : "All senders allowed"}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button
                    type="button" 
                    variant="outline"
                    onClick={() => setActiveTab("config")}
                  >
                    Edit Configuration
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Unable to retrieve Gmail reader status.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}