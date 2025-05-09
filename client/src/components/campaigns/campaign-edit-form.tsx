import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Campaign, RedirectMethod } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Loader2, X } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

// Form validation schema
const campaignEditSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  redirectMethod: z.string(),
  customPath: z.string().optional(),
  multiplier: z.number().min(0.01, "Multiplier must be at least 0.01").optional(),
  pricePerThousand: z.number().min(0, "Price must be at least 0").max(10000, "Price can't exceed $10,000").optional(),
  // TrafficStar integration fields
  trafficstarCampaignId: z.string().optional(),
  // Auto-management has been removed
  budgetUpdateTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, "Invalid time format. Use HH:MM:SS").optional(),
  // Traffic Generator fields
  trafficGeneratorEnabled: z.boolean().default(false),
  postPauseCheckMinutes: z.number().int().min(1, "Minutes must be at least 1").max(30, "Minutes can't exceed 30").default(2), 
  highSpendWaitMinutes: z.number().int().min(1, "Minutes must be at least 1").max(30, "Minutes can't exceed 30").default(11),
  // YouTube API fields
  youtubeApiEnabled: z.boolean().default(false),
  youtubeApiIntervalMinutes: z.number().int().min(15, "Minutes must be at least 15").max(1440, "Minutes can't exceed 1440").default(60),
  youtubeCheckCountryRestriction: z.boolean().default(true),
  youtubeCheckPrivate: z.boolean().default(true),
  youtubeCheckDeleted: z.boolean().default(true),
  youtubeCheckAgeRestricted: z.boolean().default(true),
  youtubeCheckMadeForKids: z.boolean().default(true),
  youtubeCheckDuration: z.boolean().default(false),
  youtubeMaxDurationMinutes: z.number().int().min(1, "Duration must be at least 1 minute").max(360, "Duration can't exceed 360 minutes").default(30),
});

type CampaignEditValues = z.infer<typeof campaignEditSchema>;

interface CampaignEditFormProps {
  campaign: Campaign;
  onSuccess?: (campaign: Campaign | any) => void;
}

export default function CampaignEditForm({ campaign, onSuccess }: CampaignEditFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  
  // Fetch TrafficStar campaigns for the dropdown
  const { data: trafficstarCampaigns = [], isLoading: isLoadingTrafficstarCampaigns } = useQuery<any[]>({
    queryKey: ['/api/trafficstar/saved-campaigns'],
    retry: false,
    staleTime: 30000 // Cache for 30 seconds
  });
  
  // Form setup with default values from existing campaign
  const form = useForm<CampaignEditValues>({
    resolver: zodResolver(campaignEditSchema),
    defaultValues: {
      name: campaign.name,
      redirectMethod: campaign.redirectMethod,
      customPath: campaign.customPath || "",
      multiplier: typeof campaign.multiplier === 'string' ? parseFloat(campaign.multiplier) : (campaign.multiplier || 1),
      pricePerThousand: typeof campaign.pricePerThousand === 'string' ? parseFloat(campaign.pricePerThousand) : (campaign.pricePerThousand || 0),
      trafficstarCampaignId: campaign.trafficstarCampaignId || "",
      // autoManageTrafficstar has been removed
      budgetUpdateTime: campaign.budgetUpdateTime || "00:00:00",
      // Traffic Generator settings
      trafficGeneratorEnabled: campaign.trafficGeneratorEnabled || false,
      postPauseCheckMinutes: campaign.postPauseCheckMinutes || 2, // Default to 2 minutes
      highSpendWaitMinutes: campaign.highSpendWaitMinutes || 11, // Default to 11 minutes
      // YouTube API settings
      youtubeApiEnabled: campaign.youtubeApiEnabled || false,
      youtubeApiIntervalMinutes: campaign.youtubeApiIntervalMinutes || 60, // Default to 60 minutes
      youtubeCheckCountryRestriction: campaign.youtubeCheckCountryRestriction !== false, // Default to true
      youtubeCheckPrivate: campaign.youtubeCheckPrivate !== false, // Default to true
      youtubeCheckDeleted: campaign.youtubeCheckDeleted !== false, // Default to true
      youtubeCheckAgeRestricted: campaign.youtubeCheckAgeRestricted !== false, // Default to true
      youtubeCheckMadeForKids: campaign.youtubeCheckMadeForKids !== false, // Default to true
      youtubeCheckDuration: campaign.youtubeCheckDuration || false, // Default to false
      youtubeMaxDurationMinutes: campaign.youtubeMaxDurationMinutes || 30 // Default to 30 minutes
    },
  });
  
  // For debugging purpose
  console.log("Campaign data:", campaign);
  console.log("Form default values:", {
    name: campaign.name,
    redirectMethod: campaign.redirectMethod,
    customPath: campaign.customPath || "",
    multiplier: typeof campaign.multiplier === 'string' ? parseFloat(campaign.multiplier) : (campaign.multiplier || 1),
    pricePerThousand: typeof campaign.pricePerThousand === 'string' ? parseFloat(campaign.pricePerThousand) : (campaign.pricePerThousand || 0),
    trafficstarCampaignId: campaign.trafficstarCampaignId || "",
    // Traffic Generator settings
    trafficGeneratorEnabled: campaign.trafficGeneratorEnabled || false,
    postPauseCheckMinutes: campaign.postPauseCheckMinutes || 2,
    highSpendWaitMinutes: campaign.highSpendWaitMinutes || 11,
    // YouTube API Settings
    youtubeApiEnabled: campaign.youtubeApiEnabled || false,
    youtubeApiIntervalMinutes: campaign.youtubeApiIntervalMinutes || 60,
    youtubeCheckCountryRestriction: campaign.youtubeCheckCountryRestriction !== false,
    youtubeCheckPrivate: campaign.youtubeCheckPrivate !== false,
    youtubeCheckDeleted: campaign.youtubeCheckDeleted !== false,
    youtubeCheckAgeRestricted: campaign.youtubeCheckAgeRestricted !== false,
    youtubeCheckMadeForKids: campaign.youtubeCheckMadeForKids !== false,
    youtubeCheckDuration: campaign.youtubeCheckDuration || false,
    youtubeMaxDurationMinutes: campaign.youtubeMaxDurationMinutes || 30,
    // Traffic Sender references removed
    // Auto-management has been removed
  });
  
  // DEBUGGING - Log specific fields for debugging
  console.log("Debug - highSpendWaitMinutes in campaign:", campaign.highSpendWaitMinutes);
  console.log("Debug - youtubeApiEnabled in campaign:", campaign.youtubeApiEnabled);
  
  // CRITICAL FIX: Force the form values to be set properly
  setTimeout(() => {
    // Set price per thousand
    form.setValue('pricePerThousand', 
      typeof campaign.pricePerThousand === 'string' 
        ? parseFloat(campaign.pricePerThousand) 
        : (campaign.pricePerThousand || 0)
    );
    
    // Don't force highSpendWaitMinutes here, let the user control it
    // This was causing the field to reset to 11
    
    // Traffic Sender code removed
  }, 100);
  
  // Schedule budget update mutation - will be used when budgetUpdateTime changes
  const forceBudgetUpdateMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      console.log("Scheduling budget update for campaign:", campaignId);
      return await apiRequest(
        "POST",
        `/api/trafficstar/campaigns/force-budget-update`,
        { campaignId }
      );
    },
    onSuccess: (data) => {
      // Show success toast
      toast({
        title: "Budget Update Scheduled",
        description: "Budget update has been scheduled for the configured time.",
      });
    },
    onError: (error) => {
      toast({
        title: "Budget Update Failed",
        description: "Failed to schedule budget update. Please check your settings.",
        variant: "destructive",
      });
      console.error("Failed to schedule budget update:", error);
    }
  });

  // Update campaign mutation
  const updateCampaignMutation = useMutation({
    mutationFn: async (values: CampaignEditValues) => {
      console.log("Updating campaign with values:", values);
      // Fixed the apiRequest call with the correct parameter order
      return await apiRequest(
        "PUT",
        `/api/campaigns/${campaign.id}`,
        values
      );
    },
    onSuccess: (data, variables) => {
      // Invalidate cached campaign data
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      
      // Track if budgetUpdateTime has changed
      const budgetUpdateTimeChanged = variables.budgetUpdateTime !== campaign.budgetUpdateTime;
      
      // Show success toast
      toast({
        title: "Campaign Updated",
        description: "Your campaign has been updated successfully.",
      });
      
      // If budgetUpdateTime changed and TrafficStar integration is enabled,
      // trigger immediate budget update
      if (
        budgetUpdateTimeChanged && 
        variables.trafficstarCampaignId && 
        variables.trafficstarCampaignId !== "none"
      ) {
        console.log("Budget update time changed - triggering immediate update");
        forceBudgetUpdateMutation.mutate(campaign.id);
      }
      
      // Close the dialog
      setOpen(false);
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        // Parse the response data if it's a Response object
        if (data instanceof Response) {
          data.json().then(parsedData => {
            onSuccess(parsedData);
          }).catch(error => {
            console.error('Error parsing response:', error);
          });
        } else {
          // Otherwise pass the data directly
          onSuccess(data);
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update campaign. Please try again.",
        variant: "destructive",
      });
      console.error("Failed to update campaign:", error);
    }
  });
  
  // Handle form submission
  const onSubmit = (values: CampaignEditValues) => {
    // Log form values being sent to server
    console.log("Submitting form values:", values);
    
    // Log form highSpendWaitMinutes value specifically
    console.log("BEFORE SUBMIT - highSpendWaitMinutes value:", values.highSpendWaitMinutes);
    console.log("BEFORE SUBMIT - youtubeApiEnabled value:", values.youtubeApiEnabled);
    
    // Make sure highSpendWaitMinutes is included and is a valid number
    if (values.highSpendWaitMinutes === undefined) {
      values.highSpendWaitMinutes = campaign.highSpendWaitMinutes || 11;
      console.log("Setting default highSpendWaitMinutes value:", values.highSpendWaitMinutes);
    }
    
    // Ensure it's a number between 1-30
    const waitMinutes = Number(values.highSpendWaitMinutes);
    if (isNaN(waitMinutes) || waitMinutes < 1) {
      values.highSpendWaitMinutes = 1;
    } else if (waitMinutes > 30) {
      values.highSpendWaitMinutes = 30;
    } else {
      values.highSpendWaitMinutes = waitMinutes;
    }
    
    console.log("AFTER VALIDATION - highSpendWaitMinutes value:", values.highSpendWaitMinutes);
    
    // CRITICAL FIX: Make sure youtubeApiEnabled is properly set as a boolean
    console.log("Before fixing YouTube API value:", values.youtubeApiEnabled, typeof values.youtubeApiEnabled);
    
    // This is very important - we need to make sure we don't lose the true value
    // First, check if the value is explicitly false
    if (values.youtubeApiEnabled === false) {
      values.youtubeApiEnabled = false;
    } else {
      // Otherwise, if it's truthy (like "true", true, 1, etc.), set to true
      values.youtubeApiEnabled = Boolean(values.youtubeApiEnabled);
    }
    
    console.log("After fixing YouTube API value:", values.youtubeApiEnabled, typeof values.youtubeApiEnabled);
    
    // Make sure YouTube API settings are handled correctly
    if (values.youtubeApiEnabled) {
      // Validate youtubeApiIntervalMinutes
      if (values.youtubeApiIntervalMinutes === undefined) {
        values.youtubeApiIntervalMinutes = campaign.youtubeApiIntervalMinutes || 60;
      }
      
      // Ensure interval is a number between 15-1440 minutes
      const intervalMinutes = Number(values.youtubeApiIntervalMinutes);
      if (isNaN(intervalMinutes) || intervalMinutes < 15) {
        values.youtubeApiIntervalMinutes = 15;
      } else if (intervalMinutes > 1440) {
        values.youtubeApiIntervalMinutes = 1440;
      } else {
        values.youtubeApiIntervalMinutes = intervalMinutes;
      }
      
      // Ensure boolean flags are properly set
      values.youtubeCheckCountryRestriction = values.youtubeCheckCountryRestriction !== false;
      values.youtubeCheckPrivate = values.youtubeCheckPrivate !== false;
      values.youtubeCheckDeleted = values.youtubeCheckDeleted !== false;
      values.youtubeCheckAgeRestricted = values.youtubeCheckAgeRestricted !== false;
      values.youtubeCheckMadeForKids = values.youtubeCheckMadeForKids !== false;
      values.youtubeCheckDuration = values.youtubeCheckDuration === true;
      
      // Validate youtubeMaxDurationMinutes
      if (values.youtubeMaxDurationMinutes === undefined) {
        values.youtubeMaxDurationMinutes = campaign.youtubeMaxDurationMinutes || 30;
      }
      
      // Ensure max duration is a number between 1-180 minutes
      const maxDurationMinutes = Number(values.youtubeMaxDurationMinutes);
      if (isNaN(maxDurationMinutes) || maxDurationMinutes < 1) {
        values.youtubeMaxDurationMinutes = 1;
      } else if (maxDurationMinutes > 180) {
        values.youtubeMaxDurationMinutes = 180;
      } else {
        values.youtubeMaxDurationMinutes = maxDurationMinutes;
      }
    }
    
    console.log("AFTER VALIDATION - youtubeApiEnabled value:", values.youtubeApiEnabled);
    
    updateCampaignMutation.mutate(values);
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <Edit className="h-3.5 w-3.5" />
          Edit Campaign
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[475px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Campaign</DialogTitle>
          <DialogDescription>
            Update your campaign details and settings.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            {/* Campaign ID display */}
            <div className="flex items-center mb-2">
              <span className="text-sm font-semibold text-gray-500">Campaign ID:</span>
              <span className="text-sm ml-2 px-2 py-1 bg-gray-100 rounded">{campaign.id}</span>
            </div>
            
            {/* Campaign Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter campaign name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Redirect Method */}
            <FormField
              control={form.control}
              name="redirectMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Redirect Method</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a redirect method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={RedirectMethod.DIRECT}>Direct Redirect</SelectItem>
                      <SelectItem value={RedirectMethod.META_REFRESH}>Meta Refresh</SelectItem>
                      <SelectItem value={RedirectMethod.DOUBLE_META_REFRESH}>Double Meta Refresh</SelectItem>
                      <SelectItem value={RedirectMethod.HTTP_307}>HTTP 307 Redirect</SelectItem>
                      <SelectItem value={RedirectMethod.HTTP2_307_TEMPORARY}>HTTP/2.0 307 Temporary</SelectItem>
                      <SelectItem value={RedirectMethod.HTTP2_FORCED_307}>HTTP/2.0 Forced 307</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose how users will be redirected to your target URLs.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Custom Path */}
            <FormField
              control={form.control}
              name="customPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Path (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. my-campaign" 
                      {...field} 
                      value={field.value || ""} 
                    />
                  </FormControl>
                  <FormDescription>
                    Create a custom URL path that will be used to access this campaign.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Click Multiplier */}
            <FormField
              control={form.control}
              name="multiplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Click Multiplier</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="0.01"
                      step="0.01"
                      {...field}
                      onChange={(e) => {
                        // Handle empty/invalid input cases
                        const value = e.target.value === '' ? '' : e.target.value;
                        // Only update field if value is valid
                        const parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                          field.onChange(parsedValue);
                        } else {
                          // For empty input, set field to empty string to allow user typing
                          field.onChange(value);
                        }
                      }}
                      value={field.value}
                    />
                  </FormControl>
                  <FormDescription>
                    Multiply all URL click limits in this campaign by this value. When a URL is added with limit 10 and the multiplier is 2, the effective limit will be 20.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Price Per Thousand */}
            <FormField
              control={form.control}
              name="pricePerThousand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price Per 1000 Clicks</FormLabel>
                  <FormControl>
                    <div className="flex items-center">
                      <div className="bg-gray-100 px-3 py-2 text-gray-500 border border-r-0 rounded-l-md text-sm">
                        $
                      </div>
                      <Input 
                        type="number" 
                        min="0"
                        max="10000"
                        step="0.0001"
                        className="rounded-l-none"
                        {...field}
                        onChange={(e) => {
                          console.log("Price input change:", e.target.value);
                          // Handle empty/invalid input cases
                          const value = e.target.value === '' ? '0' : e.target.value;
                          // Only update field if value is valid
                          const parsedValue = parseFloat(value);
                          if (!isNaN(parsedValue)) {
                            console.log("Setting price to number:", parsedValue);
                            field.onChange(parsedValue);
                          } else {
                            // If parsing fails, set to 0
                            console.log("Setting price to fallback 0");
                            field.onChange(0);
                          }
                        }}
                        value={field.value === 0 ? "0" : field.value}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Set the price per 1000 clicks ($0.01-$10,000). For example, if you set $0.10, then for 1000 clicks the price will be $0.10, for 2000 clicks it will be $0.20.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* TrafficStar Integration Section */}
            <div className="border-t pt-4 mt-6">
              <h3 className="text-md font-medium mb-4">TrafficStar Integration</h3>
              
              {/* TrafficStar Campaign Selection - With option for direct ID input */}
              <FormField
                control={form.control}
                name="trafficstarCampaignId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TrafficStar Campaign</FormLabel>
                    <div className="flex flex-col space-y-2">
                      {/* Direct ID input field - always visible */}
                      <div className="flex space-x-2">
                        <Input 
                          type="text"
                          placeholder="Enter TrafficStar Campaign ID directly"
                          value={field.value === "none" ? "" : field.value || ""}
                          onChange={(e) => {
                            const value = e.target.value.trim();
                            field.onChange(value || "none");
                          }}
                          className="flex-1"
                        />
                        {field.value && field.value !== "none" && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => field.onChange("none")}
                            title="Clear campaign ID"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Or divider */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Or select from list
                          </span>
                        </div>
                      </div>

                      {/* Dropdown selection as alternative */}
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                        }}
                        value={trafficstarCampaigns.some(c => c.trafficstarId === field.value) ? field.value : "custom"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select TrafficStar campaign">
                              {isLoadingTrafficstarCampaigns && (
                                <div className="flex items-center">
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  <span>Loading campaigns...</span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None (No TrafficStar integration)</SelectItem>
                          <SelectItem value="custom" disabled={!field.value || field.value === "none"}>
                            Custom ID: {field.value !== "none" ? field.value : ""}
                          </SelectItem>
                          <SelectItem value="spacer" disabled className="py-1 my-1 border-t cursor-default">
                            <span className="text-xs text-gray-500">Available Campaigns</span>
                          </SelectItem>
                          {trafficstarCampaigns.map((tsCampaign: any) => (
                            <SelectItem 
                              key={tsCampaign.trafficstarId} 
                              value={tsCampaign.trafficstarId || `campaign-${tsCampaign.id}`}
                            >
                              {tsCampaign.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <FormDescription>
                      Link this campaign to a TrafficStar campaign for spent value tracking
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* TrafficStar spent tracking configuration */}
              <div className="rounded-lg border p-3 mt-4">
                <div className="space-y-0.5">
                  <h4 className="font-medium">TrafficStar Spent Tracking</h4>
                  <p className="text-sm text-muted-foreground">
                    When a TrafficStar campaign is selected:<br />
                    • Daily spent value is tracked every 2 minutes<br />
                    • Daily budget is set to $10.15 at specified UTC time
                  </p>
                </div>
              </div>
              
              {/* Traffic Generator Section */}
              <div className="rounded-lg border p-3 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Traffic Generator</h4>
                    <FormField
                      control={form.control}
                      name="trafficGeneratorEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">
                              {field.value ? "Enabled" : "Disabled"}
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    When enabled, Traffic Generator will automatically manage traffic for this campaign.
                  </p>
                  
                  {/* Post-Pause Check Time Interval - only show when Traffic Generator is enabled */}
                  {form.watch("trafficGeneratorEnabled") && (
                    <FormField
                      control={form.control}
                      name="postPauseCheckMinutes"
                      render={({ field }) => (
                        <FormItem className="mt-3 pt-3 border-t border-gray-100">
                          <FormLabel>Time Interval After Pause (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="30"
                              step="1"
                              {...field}
                              onChange={(e) => {
                                // Just use the raw value from the input to allow proper editing
                                const value = e.target.value;
                                
                                // Only parse and validate when submitting or onBlur
                                if (value === '') {
                                  // Empty field - set default
                                  field.onChange(2);
                                } else {
                                  // Update with the raw value
                                  const parsedValue = parseInt(value, 10);
                                  if (!isNaN(parsedValue)) {
                                    field.onChange(parsedValue);
                                  }
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Time to wait after pausing a campaign before checking spent value (1-30 minutes).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {/* High Spend Wait Interval - only show when Traffic Generator is enabled */}
                  {form.watch("trafficGeneratorEnabled") && (
                    <FormField
                      control={form.control}
                      name="highSpendWaitMinutes"
                      render={({ field }) => (
                        <FormItem className="mt-3 pt-3 border-t border-gray-100">
                          <FormLabel>More than $10 Interval (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              max="30"
                              step="1"
                              {...field}
                              onChange={(e) => {
                                // Get raw value
                                const value = e.target.value;
                                console.log("High Spend Wait Minutes input change:", value);
                                
                                if (value === '') {
                                  // Don't update the field for empty value - allow user to type
                                  console.log("Empty high spend wait minutes - keeping current value");
                                  return;
                                } else {
                                  // Parse to integer
                                  const parsedValue = parseInt(value, 10);
                                  if (!isNaN(parsedValue)) {
                                    // Ensure it's within range before updating
                                    let finalValue = parsedValue;
                                    if (finalValue < 1) finalValue = 1;
                                    if (finalValue > 30) finalValue = 30;
                                    
                                    console.log("Setting highSpendWaitMinutes to:", finalValue);
                                    field.onChange(finalValue);
                                  }
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Time to wait after pausing a high-spend campaign ($10+) before recalculating budget (1-30 minutes).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
              
              {/* Budget Update Time */}
              {form.watch("trafficstarCampaignId") && form.watch("trafficstarCampaignId") !== "none" && (
                <FormField
                  control={form.control}
                  name="budgetUpdateTime"
                  render={({ field }) => {
                    // Calculate current UTC time
                    const now = new Date();
                    const utcHours = now.getUTCHours().toString().padStart(2, '0');
                    const utcMinutes = now.getUTCMinutes().toString().padStart(2, '0');
                    const currentUtcTime = `${utcHours}:${utcMinutes}`;
                    
                    // Split current time value into hours and minutes
                    const timeValue = field.value || "00:00:00";
                    const [hours, minutes] = timeValue.split(':');
                    
                    // Create hours array with 24-hour format (00-23)
                    const hoursOptions = Array.from({ length: 24 }, (_, i) => 
                      i.toString().padStart(2, '0')
                    );
                    
                    // Create minutes array (00-59)
                    const minutesOptions = Array.from({ length: 60 }, (_, i) => 
                      i.toString().padStart(2, '0')
                    );
                    
                    return (
                      <FormItem className="mt-4">
                        <FormLabel>Daily Budget Update & Pause Time (UTC)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <div className="flex items-center space-x-2">
                              {/* Hours dropdown (24-hour format) */}
                              <Select
                                value={hours || "00"}
                                onValueChange={(value) => {
                                  const newTime = `${value}:${minutes || "00"}:00`;
                                  field.onChange(newTime);
                                }}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue placeholder="Hour" />
                                </SelectTrigger>
                                <SelectContent>
                                  {hoursOptions.map((hour) => (
                                    <SelectItem key={hour} value={hour}>
                                      {hour}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              
                              <span className="text-lg">:</span>
                              
                              {/* Minutes dropdown */}
                              <Select
                                value={minutes || "00"}
                                onValueChange={(value) => {
                                  const newTime = `${hours || "00"}:${value}:00`;
                                  field.onChange(newTime);
                                }}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue placeholder="Min" />
                                </SelectTrigger>
                                <SelectContent>
                                  {minutesOptions.map((min) => (
                                    <SelectItem key={min} value={min}>
                                      {min}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              
                              <div className="ml-3 text-xs text-gray-500">
                                Current UTC: {currentUtcTime}
                              </div>
                            </div>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Set the exact UTC time when the $10.15 budget will be applied daily.
                          The system will automatically update the campaign budget AND pause the campaign at this time.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
              
              {/* Traffic Sender section removed */}
            </div>
            
            {/* YouTube API Section */}
            <div className="rounded-lg border p-3 mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">YouTube API Monitor</h4>
                  <FormField
                    control={form.control}
                    name="youtubeApiEnabled"
                    render={({ field }) => {
                      // Add logging to debug the value
                      console.log("YouTube API Switch render:", field.value, typeof field.value);
                      
                      return (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value === true}
                              onCheckedChange={(checked) => {
                                console.log("Switch toggled to:", checked);
                                field.onChange(checked);
                                
                                // Force the form value to be a boolean
                                form.setValue('youtubeApiEnabled', checked === true);
                                
                                console.log("After toggle, form value:", form.getValues('youtubeApiEnabled'));
                              }}
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm">
                              {field.value === true ? "Enabled" : "Disabled"}
                            </FormLabel>
                          </div>
                        </FormItem>
                      );
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  When enabled, YouTube API will automatically check and remove problematic YouTube URLs from the campaign.
                </p>
                
                {/* Check Interval - only show when YouTube API is enabled */}
                {form.watch("youtubeApiEnabled") && (
                  <FormField
                    control={form.control}
                    name="youtubeApiIntervalMinutes"
                    render={({ field }) => (
                      <FormItem className="mt-3 pt-3 border-t border-gray-100">
                        <FormLabel>Check Interval (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="15"
                            max="1440"
                            step="15"
                            {...field}
                            onChange={(e) => {
                              // Just use the raw value from the input to allow proper editing
                              const value = e.target.value;
                              
                              // Only parse and validate when submitting or onBlur
                              if (value === '') {
                                // Empty field - set default
                                field.onChange(60);
                              } else {
                                // Update with the raw value
                                const parsedValue = parseInt(value, 10);
                                if (!isNaN(parsedValue)) {
                                  field.onChange(parsedValue);
                                }
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          How often to check URLs using YouTube API (15-1440 minutes). Recommended: 60 minutes.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Video Status Checks - only show when YouTube API is enabled */}
                {form.watch("youtubeApiEnabled") && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <FormLabel className="block mb-2">URL Removal Conditions</FormLabel>
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="youtubeCheckCountryRestriction"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove videos restricted in India
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="youtubeCheckPrivate"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove private videos
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="youtubeCheckDeleted"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove deleted videos
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="youtubeCheckAgeRestricted"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove age-restricted videos
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="youtubeCheckMadeForKids"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove videos made for kids
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="youtubeCheckDuration"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox 
                                checked={field.value} 
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Remove videos exceeding maximum duration
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      
                      {form.watch("youtubeCheckDuration") && (
                        <FormField
                          control={form.control}
                          name="youtubeMaxDurationMinutes"
                          render={({ field }) => (
                            <FormItem className="ml-6 mt-2">
                              <FormLabel className="text-sm">Maximum Video Duration (minutes)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max="360"
                                  step="1"
                                  className="w-28"
                                  {...field}
                                  onChange={(e) => {
                                    // Just use the raw value from the input to allow proper editing
                                    const value = e.target.value;
                                    
                                    // Only parse and validate when submitting or onBlur
                                    if (value === '') {
                                      // Empty field - set default
                                      field.onChange(30);
                                    } else {
                                      // Update with the raw value
                                      const parsedValue = parseInt(value, 10);
                                      if (!isNaN(parsedValue)) {
                                        field.onChange(parsedValue);
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                Videos longer than this will be removed (1-360 min). Default: 30 min.
                              </FormDescription>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                    <FormDescription className="mt-2">
                      When a URL is removed due to these conditions, it will be recorded in YouTube URL Records.
                    </FormDescription>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button 
                type="submit" 
                disabled={updateCampaignMutation.isPending}
              >
                {updateCampaignMutation.isPending ? "Updating..." : "Update Campaign"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}