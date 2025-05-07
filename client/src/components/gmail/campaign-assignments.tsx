import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Define form schema
const assignmentFormSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  minClickQuantity: z.coerce.number().int().positive(),
  maxClickQuantity: z.coerce.number().int().positive(),
  priority: z.coerce.number().int().positive().default(1),
  active: z.boolean().default(true)
}).refine(data => data.maxClickQuantity > data.minClickQuantity, {
  message: "Maximum click quantity must be greater than minimum click quantity",
  path: ["maxClickQuantity"]
});

// Types for Gmail assignments
type GmailCampaignAssignment = {
  id: number;
  campaignId: number;
  minClickQuantity: number;
  maxClickQuantity: number;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  campaign?: {
    id: number;
    name: string;
  };
};

type Campaign = {
  id: number;
  name: string;
};

export default function GmailCampaignAssignments() {
  const { toast } = useToast();
  const [isAddingNew, setIsAddingNew] = useState(false);
  
  // Get all campaign assignments
  const { data: assignments, isLoading: isLoadingAssignments } = useQuery<GmailCampaignAssignment[]>({
    queryKey: ["/api/gmail/assignments"],
    staleTime: 5000, // 5 seconds
  });
  
  // Get all campaigns for the dropdown
  const { data: campaigns, isLoading: isLoadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns/list"],
    staleTime: 5000, // 5 seconds
  });
  
  // Form for adding new assignment
  const form = useForm<z.infer<typeof assignmentFormSchema>>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      campaignId: 0,
      minClickQuantity: 1,
      maxClickQuantity: 1000,
      priority: 1,
      active: true
    },
  });
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof assignmentFormSchema>) => {
      const res = await apiRequest("POST", "/api/gmail/assignments", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Assignment rule created",
        description: "The campaign assignment rule has been created successfully.",
      });
      form.reset();
      setIsAddingNew(false);
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/assignments"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create assignment rule",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/gmail/assignments/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Assignment rule deleted",
        description: "The campaign assignment rule has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/assignments"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete assignment rule",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/gmail/assignments/${id}`, { active });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Assignment rule updated",
        description: "The active status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/assignments"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update assignment rule",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Submit handler
  function onSubmit(data: z.infer<typeof assignmentFormSchema>) {
    createMutation.mutate(data);
  }
  
  // Toggle an assignment's active status
  function toggleActive(id: number, currentActive: boolean) {
    toggleActiveMutation.mutate({ id, active: !currentActive });
  }
  
  // Delete an assignment
  function deleteAssignment(id: number) {
    if (confirm("Are you sure you want to delete this assignment rule?")) {
      deleteMutation.mutate(id);
    }
  }
  
  function getCampaignName(campaignId: number) {
    const campaign = campaigns?.find(c => c.id === campaignId);
    return campaign ? campaign.name : `Campaign ${campaignId}`;
  }
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Gmail Campaign Assignments</CardTitle>
        <CardDescription>
          Configure rules for assigning URLs from Gmail to specific campaigns based on click quantity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingAssignments || isLoadingCampaigns ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {assignments && assignments.length > 0 ? (
              <Table>
                <TableCaption>Rules are processed in order of priority (lower number = higher priority)</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Min Clicks</TableHead>
                    <TableHead>Max Clicks</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.sort((a, b) => a.priority - b.priority).map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{getCampaignName(assignment.campaignId)}</TableCell>
                      <TableCell>{assignment.minClickQuantity.toLocaleString()}</TableCell>
                      <TableCell>{assignment.maxClickQuantity.toLocaleString()}</TableCell>
                      <TableCell>{assignment.priority}</TableCell>
                      <TableCell>
                        <Switch 
                          checked={assignment.active} 
                          onCheckedChange={() => toggleActive(assignment.id, assignment.active)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAssignment(assignment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No assignment rules found. Add one below.
              </div>
            )}
            
            {isAddingNew ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-6 border rounded-md p-4">
                  <h3 className="text-lg font-medium">Add Assignment Rule</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="campaignId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Campaign</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              {...field}
                            >
                              <option value="0" disabled>Select a campaign</option>
                              {campaigns?.map(campaign => (
                                <option key={campaign.id} value={campaign.id}>
                                  {campaign.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority (lower = higher priority)</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="minClickQuantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Click Quantity</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" {...field} />
                          </FormControl>
                          <FormDescription>
                            The minimum number of clicks in the quantity range
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="maxClickQuantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Click Quantity</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" {...field} />
                          </FormControl>
                          <FormDescription>
                            The maximum number of clicks in the quantity range
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Whether this assignment rule is active and should be used
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
                  
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingNew(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </form>
              </Form>
            ) : (
              <Button
                onClick={() => setIsAddingNew(true)}
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" /> Add Assignment Rule
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}