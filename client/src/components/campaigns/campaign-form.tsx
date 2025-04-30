import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { InfoIcon, Loader2 } from "lucide-react";
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
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Campaign, RedirectMethod, insertCampaignSchema } from "@shared/schema";

interface CampaignFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (campaign: Campaign) => void;
}

const formSchema = insertCampaignSchema.extend({
  name: z.string().min(1, "Campaign name is required").max(100, "Campaign name must be 100 characters or less"),
  customPath: z.string().max(50, "Custom path must be 50 characters or less")
    .regex(/^[a-z0-9-]*$/, "Only lowercase letters, numbers, and hyphens are allowed")
    .optional(),
  pricePerThousand: z.number().min(0, "Price must be at least 0").max(10000, "Price can't exceed $10,000").optional(),
});

// Mapping for human-readable redirect method descriptions
const redirectMethodLabels = {
  [RedirectMethod.DIRECT]: "Direct (Simple Redirect)",
  [RedirectMethod.META_REFRESH]: "Meta Refresh",
  [RedirectMethod.DOUBLE_META_REFRESH]: "Double Meta Refresh",
  [RedirectMethod.HTTP_307]: "HTTP 307 Redirect",
  [RedirectMethod.HTTP2_307_TEMPORARY]: "HTTP/2.0 307 Temporary",
  [RedirectMethod.HTTP2_FORCED_307]: "HTTP/2.0 Forced 307",
};

export default function CampaignForm({ open, onOpenChange, onSuccess }: CampaignFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch TrafficStar campaigns for the dropdown
  const { data: trafficstarCampaigns = [], isLoading: isLoadingTrafficstarCampaigns } = useQuery<any[]>({
    queryKey: ['/api/trafficstar/saved-campaigns'],
    retry: false,
    staleTime: 30000 // Cache for 30 seconds
  });
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      redirectMethod: RedirectMethod.DIRECT,
      customPath: "",
      multiplier: 1,
      pricePerThousand: 0,
      trafficstarCampaignId: "",
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      console.log("Creating campaign with data:", data);
      // Fixed the parameter order to match the updated apiRequest function
      return await apiRequest("POST", "/api/campaigns", data);
    },
    onSuccess: (data: Campaign) => {
      toast({
        title: "Campaign Created",
        description: `"${data.name}" has been created successfully`,
        variant: "success",
      });
      
      form.reset();
      onOpenChange(false);
      
      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create campaign",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    createCampaign.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <SelectValue placeholder="Select redirect method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(redirectMethodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Choose how visitors will be redirected to target URLs
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customPath"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Custom Path</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-[220px] text-xs">
                            Create a custom keyword path for your campaign URLs.
                            Example: "summer-promo" would create a URL like: mydomain.com/views/summer-promo
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <FormControl>
                    <div className="flex items-center">
                      <div className="bg-gray-100 px-3 py-2 text-gray-500 border border-r-0 rounded-l-md text-sm">
                        {window.location.origin}/views/
                      </div>
                      <Input 
                        placeholder="custom-path" 
                        {...field} 
                        className="rounded-l-none"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Optional. Use lowercase letters, numbers, and hyphens only.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="multiplier"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Click Multiplier</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-[220px] text-xs">
                            Automatically multiply click limits for all URLs in this campaign.
                            For example, if set to 2 and a URL has a limit of 10, the effective limit will be 20.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
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
                    Multiply all URL click limits in this campaign by this value.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="pricePerThousand"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Price Per 1000 Clicks</FormLabel>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-4 w-4 text-gray-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="w-[220px] text-xs">
                            Set the price per 1000 clicks for this campaign.
                            This will be used to calculate the total price based on required clicks.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
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
                        {...field}
                        className="rounded-l-none"
                        onChange={(e) => {
                          // Handle empty/invalid input cases
                          const value = e.target.value === '' ? '0' : e.target.value;
                          // Only update field if value is valid
                          const parsedValue = parseFloat(value);
                          if (!isNaN(parsedValue)) {
                            console.log("Setting price to number:", parsedValue);
                            field.onChange(parsedValue);
                          } else {
                            // For empty or invalid input, set to 0
                            console.log("Setting price to 0");
                            field.onChange(0);
                          }
                        }}
                        value={field.value}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Price per 1000 clicks (e.g., $5.50 = $5.50 per 1000 clicks, or $0.0055 per click)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* TrafficStar Integration Section */}
            <div className="border-t pt-4 mt-6">
              <h3 className="text-md font-medium mb-4">TrafficStar Integration</h3>
              
              <FormField
                control={form.control}
                name="trafficstarCampaignId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TrafficStar Campaign</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
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
                        {trafficstarCampaigns.map((campaign: any) => (
                          <SelectItem 
                            key={campaign.trafficstarId} 
                            value={campaign.trafficstarId || `campaign-${campaign.id}`}
                          >
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    • Sets daily budget to $10.15 when UTC date changes
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Campaign"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}