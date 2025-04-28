import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  useToast
} from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertOriginalUrlRecordSchema, updateOriginalUrlRecordSchema } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = insertOriginalUrlRecordSchema.extend({
  // No maximum limit on originalClickLimit, only require it to be a positive number
  originalClickLimit: z.coerce.number().min(1, {
    message: "Click limit must be at least 1",
  }),
});

type FormData = z.infer<typeof formSchema>;
type UpdateFormData = z.infer<typeof updateOriginalUrlRecordSchema>;

export default function OriginalUrlRecordsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fetch original URL records with pagination
  const { 
    data: recordsData,
    isLoading, 
    isError,
    error 
  } = useQuery({
    queryKey: ["/api/original-url-records", currentPage, pageSize, searchQuery],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      
      if (searchQuery) {
        searchParams.append("search", searchQuery);
      }
      
      const res = await fetch(`/api/original-url-records?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch original URL records");
      }
      return res.json();
    }
  });

  // Mutation for creating a new original URL record
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/original-url-records", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create record",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation for updating an existing original URL record
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number, data: UpdateFormData }) => {
      const res = await apiRequest("PUT", `/api/original-url-records/${data.id}`, data.data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      setIsEditDialogOpen(false);
      editForm.reset();
      setEditingRecord(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update record",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation for deleting an original URL record
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/original-url-records/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      setIsDeleteDialogOpen(false);
      setRecordToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete record",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Mutation for syncing an original URL record
  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/original-url-records/${id}/sync`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Original URL record synced successfully. ${data.updatedUrlCount} URLs updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sync record",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Form for creating a new record
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      targetUrl: "",
      originalClickLimit: 1000,
    },
  });

  // Form for editing an existing record
  const editForm = useForm<UpdateFormData>({
    resolver: zodResolver(updateOriginalUrlRecordSchema),
    defaultValues: {
      name: "",
      targetUrl: "",
      originalClickLimit: 1000,
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: UpdateFormData) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data });
    }
  };

  const handleEditClick = (record: any) => {
    setEditingRecord(record);
    editForm.reset({
      name: record.name,
      targetUrl: record.targetUrl,
      originalClickLimit: record.originalClickLimit,
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setRecordToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleSyncClick = (id: number) => {
    syncMutation.mutate(id);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  // Calculate total pages
  const totalPages = recordsData?.totalPages || 1;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-lg text-red-500">
          Error loading original URL records: {String(error)}
        </p>
        <Button 
          className="mt-4" 
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Original URL Records</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Record
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Original URL Record</DialogTitle>
              <DialogDescription>
                Create a new master record for URL click values that will be used across campaigns.
              </DialogDescription>
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
                        <Input placeholder="URL name/identifier" {...field} />
                      </FormControl>
                      <FormDescription>
                        A unique identifier for this URL
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
                        The destination URL
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="originalClickLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Original Click Limit</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1}
                          placeholder="1000" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        The master click limit that will be used as reference across campaigns
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : "Create Record"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Master URL Records</CardTitle>
          <CardDescription>
            These records serve as the master data source for URL click quantities across the application.
            When values are edited here, they will propagate to all linked instances in campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search bar */}
          <div className="flex mb-4 gap-2">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <Input
                placeholder="Search by name or URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" variant="outline">Search</Button>
              {searchQuery && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={handleClearSearch}
                >
                  Clear
                </Button>
              )}
            </form>
            <Select 
              value={pageSize.toString()} 
              onValueChange={(value) => setPageSize(parseInt(value))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="10 per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 per page</SelectItem>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : recordsData?.records?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No records found</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">ID</TableHead>
                      <TableHead className="w-[200px]">Name</TableHead>
                      <TableHead className="w-[250px]">Target URL</TableHead>
                      <TableHead className="text-center">Click Limit</TableHead>
                      <TableHead className="w-[150px]">Last Updated</TableHead>
                      <TableHead className="text-right w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordsData?.records?.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.id}</TableCell>
                        <TableCell>{record.name || 'Unnamed'}</TableCell>
                        <TableCell className="truncate max-w-xs">
                          {record.targetUrl ? (
                            <a 
                              href={record.targetUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              {record.targetUrl}
                            </a>
                          ) : (
                            <span className="text-gray-400">No URL</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.originalClickLimit ? record.originalClickLimit.toLocaleString() : 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.updatedAt ? formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true }) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleSyncClick(record.id)}
                              title="Sync with all linked URLs"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEditClick(record)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteClick(record.id)}
                              className="text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => handlePageChange(page)}
                          isActive={page === currentPage}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Original URL Record</DialogTitle>
            <DialogDescription>
              Edit the master record for this URL. Changes will propagate to all linked instances.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="URL name/identifier" {...field} />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for this URL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="targetUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      The destination URL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="originalClickLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Original Click Limit</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1}
                        placeholder="1000" 
                        {...field} 
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          field.onChange(isNaN(value) ? 0 : value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      The master click limit that will be used as reference across campaigns
                    </FormDescription>
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : "Update Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this original URL record? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => recordToDelete && deleteMutation.mutate(recordToDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}