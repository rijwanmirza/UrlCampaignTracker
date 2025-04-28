import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UrlFormValues } from "@/lib/types";

interface UrlFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: number;
  onSuccess: () => void;
  editingUrl?: {
    id: number;
    name: string;
    targetUrl: string;
    clickLimit: number;
    clicks: number;
  };
}

const urlFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  targetUrl: z
    .string()
    .min(1, "Target URL is required")
    .url("Please enter a valid URL (including http:// or https://)"),
  clickLimit: z
    .number()
    .min(1, "Click limit must be at least 1"),
  // Removed maximum limit restriction to allow any valid number
});

export default function UrlForm({ 
  open, 
  onOpenChange, 
  campaignId, 
  onSuccess,
  editingUrl 
}: UrlFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!editingUrl;
  
  const form = useForm<UrlFormValues>({
    resolver: zodResolver(urlFormSchema),
    defaultValues: {
      name: editingUrl?.name || "",
      targetUrl: editingUrl?.targetUrl || "",
      clickLimit: editingUrl?.clickLimit || 100,
    },
  });
  
  // Create or update URL mutation
  const urlMutation = useMutation({
    mutationFn: async (data: UrlFormValues) => {
      console.log("URL Form - Submitting data:", data);
      if (isEditing && editingUrl) {
        return apiRequest("PUT", `/api/urls/${editingUrl.id}`, data);
      } else {
        return apiRequest("POST", `/api/campaigns/${campaignId}/urls`, data);
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "URL Updated" : "URL Created",
        description: isEditing 
          ? `"${form.getValues("name")}" has been updated successfully`
          : `"${form.getValues("name")}" has been added to the campaign`,
      });
      
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error 
          ? error.message 
          : `Failed to ${isEditing ? "update" : "create"} URL`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });
  
  const onSubmit = (data: UrlFormValues) => {
    setIsSubmitting(true);
    urlMutation.mutate(data);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit URL" : "Add New URL"}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My URL" {...field} />
                  </FormControl>
                  <FormDescription>
                    A descriptive name to identify this URL
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="targetUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    The URL where users will be redirected to
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="clickLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Click Limit</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min={1}
                      // Removed maximum limit so users can enter any value
                      {...field} 
                      onChange={(e) => {
                        console.log("Click limit input changed:", e.target.value);
                        const value = e.target.value === '' ? '' : parseInt(e.target.value);
                        console.log("Parsed click limit value:", value);
                        
                        if (!isNaN(value as number)) {
                          field.onChange(value);
                        } else {
                          // For empty input, set to empty to allow user to type
                          field.onChange('');
                        }
                      }}
                      value={field.value}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum number of clicks before this URL becomes inactive
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {isEditing && (
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-500">Current clicks: <span className="font-medium">{editingUrl?.clicks}</span></p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div 
                    className="h-2 rounded-full bg-primary"
                    style={{ 
                      width: `${Math.min(100, (editingUrl?.clicks || 0) / (editingUrl?.clickLimit || 1) * 100)}%` 
                    }}
                  />
                </div>
              </div>
            )}
            
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
                {isSubmitting 
                  ? (isEditing ? "Updating..." : "Adding...") 
                  : (isEditing ? "Update URL" : "Add URL")
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}