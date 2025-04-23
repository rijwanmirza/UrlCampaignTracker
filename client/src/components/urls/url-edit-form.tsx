import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Url, updateUrlSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Edit2 } from "lucide-react";

// Form validation schema
const urlEditSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  targetUrl: z.string().url("Please enter a valid URL"),
  clickLimit: z.number().int().min(1, "Click limit must be at least 1"),
});

type UrlEditValues = z.infer<typeof urlEditSchema>;

interface UrlEditFormProps {
  url: Url;
  onSuccess?: (url: Url) => void;
}

export default function UrlEditForm({ url, onSuccess }: UrlEditFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  
  // Form setup with default values from existing URL
  const form = useForm<UrlEditValues>({
    resolver: zodResolver(urlEditSchema),
    defaultValues: {
      name: url.name,
      targetUrl: url.targetUrl,
      clickLimit: url.clickLimit,
    },
  });
  
  // Update URL mutation
  const updateUrlMutation = useMutation({
    mutationFn: async (values: UrlEditValues) => {
      const response = await apiRequest(
        "PUT",
        `/api/urls/${url.id}`,
        values
      );
      
      const data = await response.json();
      return data as Url;
    },
    onSuccess: (data) => {
      // Invalidate cached URL data
      queryClient.invalidateQueries({ queryKey: ['/api/urls'] });
      if (url.campaignId) {
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${url.campaignId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${url.campaignId}/urls`] });
      }
      
      // Show success toast
      toast({
        title: "URL Updated",
        description: "Your URL has been updated successfully.",
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
        description: "Failed to update URL. Please try again.",
        variant: "destructive",
      });
      console.error("Failed to update URL:", error);
    }
  });
  
  // Handle form submission
  const onSubmit = (values: UrlEditValues) => {
    updateUrlMutation.mutate(values);
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Edit2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[475px]">
        <DialogHeader>
          <DialogTitle>Edit URL</DialogTitle>
          <DialogDescription>
            Update your URL details and settings.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            {/* URL ID display */}
            <div className="flex items-center mb-2">
              <span className="text-sm font-semibold text-gray-500">URL ID:</span>
              <span className="text-sm ml-2 px-2 py-1 bg-gray-100 rounded font-mono">{url.id}</span>
            </div>
            
            {/* URL Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter URL name" {...field} />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this URL
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Target URL */}
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
                    The destination URL that visitors will be redirected to
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Click Limit */}
            <FormField
              control={form.control}
              name="clickLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Click Limit</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      value={field.value}
                    />
                  </FormControl>
                  <FormDescription>
                    Maximum number of clicks before this URL is automatically marked as completed
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button 
                type="submit" 
                disabled={updateUrlMutation.isPending}
              >
                {updateUrlMutation.isPending ? "Updating..." : "Update URL"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}