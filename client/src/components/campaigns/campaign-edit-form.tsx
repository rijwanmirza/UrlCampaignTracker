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
});

type CampaignEditValues = z.infer<typeof campaignEditSchema>;

interface CampaignEditFormProps {
  campaign: Campaign;
  onSuccess?: (campaign: Campaign) => void;
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
    // Auto-management has been removed
  });
  
  // CRITICAL FIX: Force the pricePerThousand to be set properly in the form
  setTimeout(() => {
    form.setValue('pricePerThousand', 
      typeof campaign.pricePerThousand === 'string' 
        ? parseFloat(campaign.pricePerThousand) 
        : (campaign.pricePerThousand || 0)
    );
  }, 100);
  
  // Force budget update mutation - will be used when budgetUpdateTime changes
  const forceBudgetUpdateMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      console.log("Forcing immediate budget update for campaign:", campaignId);
      return await apiRequest(
        "POST",
        `/api/trafficstar/campaigns/force-budget-update`,
        { campaignId }
      );
    },
    onSuccess: () => {
      // Show success toast
      toast({
        title: "Budget Update Triggered",
        description: "Budget update has been applied immediately.",
      });
    },
    onError: (error) => {
      toast({
        title: "Budget Update Failed",
        description: "Failed to trigger immediate budget update. The scheduled update will still apply.",
        variant: "destructive",
      });
      console.error("Failed to force budget update:", error);
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
        onSuccess(data);
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
              
              {/* TrafficStar spent tracking is now automatically enabled when a TrafficStar campaign is selected */}
              <div className="rounded-lg border p-3 mt-4">
                <div className="space-y-0.5">
                  <h4 className="font-medium">TrafficStar Spent Tracking</h4>
                  <p className="text-sm text-muted-foreground">
                    Spent value tracking is automatically enabled when a TrafficStar campaign is selected.<br />
                    • Updates daily spent value every 2 minutes<br />
                    • Sets daily budget to $10.15 at specified UTC time
                  </p>
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
                        <FormLabel>Daily Budget Update Time (UTC)</FormLabel>
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
                          The system will automatically update the campaign budget at this time.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
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