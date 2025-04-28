/**
 * Frontend Code for Original URL Records
 * 
 * This file contains example React components that you can integrate
 * for the Original URL Records feature. Copy these components to your
 * client/src/pages directory.
 */

// =====================================================================
// ORIGINAL URL RECORDS PAGE
// File: client/src/pages/original-url-records-page.jsx
// =====================================================================

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Plus, Trash2, RefreshCw, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

// Form schema validation
const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  target_url: z.string().url("Must be a valid URL"),
  click_limit: z.coerce.number().int().min(0, "Must be a positive number"),
  clicks: z.coerce.number().int().min(0, "Must be a positive number"),
  status: z.enum(["active", "paused"]),
  notes: z.string().optional(),
});

export default function OriginalUrlRecordsPage() {
  const [isNewRecordDialogOpen, setIsNewRecordDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch records
  const {
    data,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['/api/original-url-records', pageIndex, pageSize],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/original-url-records?limit=${pageSize}&offset=${pageIndex * pageSize}`);
      return await res.json();
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values) => {
      const res = await apiRequest('POST', '/api/original-url-records', values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] });
      setIsNewRecordDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create record: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }) => {
      const res = await apiRequest('PATCH', `/api/original-url-records/${id}`, values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] });
      setIsEditDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update record: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await apiRequest('DELETE', `/api/original-url-records/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete record: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (id) => {
      const res = await apiRequest('POST', `/api/original-url-records/${id}/sync`);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Successful",
        description: `Updated ${data.updatedCount} URLs with new values`,
      });
      setIsSyncDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Setup forms
  const newForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      target_url: "https://",
      click_limit: 0,
      clicks: 0,
      status: "active",
      notes: "",
    },
  });

  const editForm = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      target_url: "",
      click_limit: 0,
      clicks: 0,
      status: "active",
      notes: "",
    },
  });

  // Helper to open edit dialog
  const openEditDialog = (record) => {
    setCurrentRecord(record);
    editForm.reset({
      name: record.name,
      target_url: record.target_url,
      click_limit: record.click_limit,
      clicks: record.clicks,
      status: record.status,
      notes: record.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  // Helper to open sync dialog
  const openSyncDialog = (record) => {
    setCurrentRecord(record);
    setIsSyncDialogOpen(true);
  };

  // Handle new record submit
  const onSubmitNew = (values) => {
    createMutation.mutate(values);
  };

  // Handle edit record submit
  const onSubmitEdit = (values) => {
    updateMutation.mutate({ id: currentRecord.id, values });
  };

  // Handle sync confirmation
  const handleSync = () => {
    syncMutation.mutate(currentRecord.id);
  };

  // Handle delete confirmation
  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this record? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  // Handle pagination
  const handlePreviousPage = () => {
    setPageIndex(Math.max(0, pageIndex - 1));
  };

  const handleNextPage = () => {
    if (data?.pagination && pageIndex < Math.ceil(data.pagination.total / pageSize) - 1) {
      setPageIndex(pageIndex + 1);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Original URL Records</h1>
          <p className="text-muted-foreground mb-4">
            Master records for URL data. Updates here can be propagated to all linked URLs.
          </p>
        </div>
        <Button onClick={() => setIsNewRecordDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Record
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>Error loading records: {error?.message}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] })}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-6">
              <Table>
                <TableCaption>
                  {data?.pagination && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, data.pagination.total)} of {data.pagination.total} records
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePreviousPage}
                          disabled={pageIndex === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleNextPage}
                          disabled={!data.pagination.hasMore}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Target URL</TableHead>
                    <TableHead>Click Limit</TableHead>
                    <TableHead>Current Clicks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.records?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-32">
                        <p className="text-muted-foreground">No records found</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => setIsNewRecordDialogOpen(true)}
                        >
                          Create your first record
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.records?.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.name}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          <a 
                            href={record.target_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {record.target_url}
                          </a>
                        </TableCell>
                        <TableCell>{record.click_limit.toLocaleString()}</TableCell>
                        <TableCell>{record.clicks.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={record.status === "active" ? "success" : "secondary"}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openEditDialog(record)}
                              title="Edit"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openSyncDialog(record)}
                              title="Sync to URLs"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDelete(record.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* New Record Dialog */}
      <Dialog open={isNewRecordDialogOpen} onOpenChange={setIsNewRecordDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Original URL Record</DialogTitle>
            <DialogDescription>
              Add a new master record for URL data. This will become the source of truth for any URLs with the same name.
            </DialogDescription>
          </DialogHeader>

          <Form {...newForm}>
            <form onSubmit={newForm.handleSubmit(onSubmitNew)} className="space-y-4">
              <FormField
                control={newForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for this URL. Used to match with campaign URLs.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={newForm.control}
                name="target_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target URL</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      The destination URL that visitors will be redirected to.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={newForm.control}
                  name="click_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Click Limit</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                      <FormDescription>
                        Maximum number of clicks allowed.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={newForm.control}
                  name="clicks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Clicks</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                      <FormDescription>
                        Current click count for this URL.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={newForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Whether this URL is currently active.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={newForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Optional notes about this URL record"
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsNewRecordDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : "Create Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Original URL Record</DialogTitle>
            <DialogDescription>
              Update the master record for this URL. Changes can be propagated to linked URLs using the sync feature.
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for this URL. Used to match with campaign URLs.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="target_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target URL</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      The destination URL that visitors will be redirected to.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="click_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Click Limit</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                      <FormDescription>
                        Maximum number of clicks allowed.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="clicks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Clicks</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                      <FormDescription>
                        Current click count for this URL.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Whether this URL is currently active.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Optional notes about this URL record"
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : "Update Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Sync Confirmation Dialog */}
      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Sync URLs with Original Record</DialogTitle>
            <DialogDescription>
              This will update all URLs matching "{currentRecord?.name}" with the click values from this original record.
            </DialogDescription>
          </DialogHeader>
          
          {currentRecord && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <div className="mt-1">{currentRecord.name}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Click Limit</Label>
                  <div className="mt-1">{currentRecord.click_limit.toLocaleString()}</div>
                </div>
              </div>
              
              <div className="border rounded-md p-4 bg-muted/30 mb-4">
                <h4 className="font-medium mb-2">What this does:</h4>
                <ul className="text-sm space-y-1 list-disc pl-4">
                  <li>Finds all URLs with name "{currentRecord.name}"</li>
                  <li>Updates their click limit and current click values</li>
                  <li>Applies campaign multipliers if they exist</li>
                </ul>
              </div>
              
              <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-4 text-orange-800 dark:text-orange-300 mb-4">
                <h4 className="font-medium mb-1">Important:</h4>
                <p className="text-sm">
                  This operation directly updates click values, bypassing the normal protection measures.
                  Use this feature carefully, as it will overwrite existing click values.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsSyncDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : "Sync Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}