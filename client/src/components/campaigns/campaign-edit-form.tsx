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
import { Edit, Loader2 } from "lucide-react";
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
  autoManageTrafficstar: z.boolean().optional(),
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
      autoManageTrafficstar: Boolean(campaign.autoManageTrafficstar),
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
    autoManageTrafficstar: Boolean(campaign.autoManageTrafficstar),
  });
  
  // CRITICAL FIX: Force the pricePerThousand to be set properly in the form
  setTimeout(() => {
    form.setValue('pricePerThousand', 
      typeof campaign.pricePerThousand === 'string' 
        ? parseFloat(campaign.pricePerThousand) 
        : (campaign.pricePerThousand || 0)
    );
  }, 100);
  
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
    onSuccess: (data) => {
      // Invalidate cached campaign data
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      
      // Show success toast
      toast({
        title: "Campaign Updated",
        description: "Your campaign has been updated successfully.",
      });
      
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
              
              {/* TrafficStar Campaign Selection */}
              <FormField
                control={form.control}
                name="trafficstarCampaignId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TrafficStar Campaign</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "none"}
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
                    <FormDescription>
                      Link this campaign to a TrafficStar campaign for automatic management
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Auto-Manage TrafficStar */}
              <FormField
                control={form.control}
                name="autoManageTrafficstar"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 mt-4">
                    <div className="space-y-0.5">
                      <FormLabel>Auto-Manage TrafficStar</FormLabel>
                      <FormDescription>
                        Automatically start campaign when remaining clicks exceed 15,000<br />
                        Automatically set daily budget to $10.15 when UTC date changes
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!form.watch("trafficstarCampaignId") || form.watch("trafficstarCampaignId") === "none"}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
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