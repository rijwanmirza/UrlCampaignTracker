import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUrlSchema } from "@shared/schema";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/components/ui/use-toast";
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

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetUrl: z.string().url("Please enter a valid URL"),
  clickLimit: z.coerce.number().positive("Click limit must be a positive number"),
});

export default function UrlForm({ open, onOpenChange, campaignId, onSuccess, editingUrl }: UrlFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      targetUrl: "",
      clickLimit: 100,
    },
  });

  // Update form values when editing a URL
  useEffect(() => {
    if (editingUrl) {
      form.reset({
        name: editingUrl.name,
        targetUrl: editingUrl.targetUrl,
        clickLimit: editingUrl.clickLimit,
      });
    } else {
      form.reset({
        name: "",
        targetUrl: "",
        clickLimit: 100,
      });
    }
  }, [form, editingUrl, open]);

  const createUrl = useMutation({
    mutationFn: async (data: UrlFormValues) => {
      if (editingUrl) {
        // Update existing URL
        const response = await apiRequest("PUT", `/api/urls/${editingUrl.id}`, {
          ...data,
          campaignId,
          clicks: editingUrl.clicks,
        });
        return response.json();
      } else {
        // Create new URL
        const response = await apiRequest("POST", `/api/campaigns/${campaignId}/urls`, data);
        return response.json();
      }
    },
    onSuccess: (data) => {
      toast({
        title: editingUrl ? "URL Updated" : "URL Added",
        description: `"${data.name}" has been ${editingUrl ? "updated" : "added to the campaign"}`,
        variant: "success",
      });
      
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${editingUrl ? "update" : "add"} URL`,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    createUrl.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingUrl ? "Edit URL" : "Add URL"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter URL name" {...field} />
                  </FormControl>
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
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                {isSubmitting ? "Saving..." : editingUrl ? "Save Changes" : "Add URL"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
