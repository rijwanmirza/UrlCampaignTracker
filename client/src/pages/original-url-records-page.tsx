import { useState, useEffect } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Pause,
  Play,
  AlertTriangle,
  Filter,
  ChevronDown,
  ArrowDownUp,
  Search,
  X
} from "lucide-react";
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
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active"); // Default to active URLs
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, campaignFilter, statusFilter, pageSize]);
  
  // Mutation for fixing click protection trigger
  const fixClickProtectionMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await apiRequest("POST", `/api/system/click-protection/fix-trigger`);
        const jsonData = await res.json();
        return jsonData;
      } catch (error) {
        console.error("Error fixing click protection:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Click protection trigger fixed successfully: ${data.message || "Now updates from Original URL Records will propagate correctly"}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fix click protection",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Fetch original URL records with pagination
  const { 
    data: recordsData,
    isLoading, 
    isError,
    error 
  } = useQuery({
    queryKey: ["/api/original-url-records", currentPage, pageSize, searchQuery, campaignFilter, statusFilter],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString()
      });
      
      // When searching, ignore campaign filter to allow searching across all records
      // and set status to 'all' to search all records
      if (searchQuery) {
        searchParams.append("search", searchQuery);
        // Override status filter to search across all records during search
        searchParams.append("status", "all");
        console.log("Search mode: Searching across ALL records regardless of status or campaign");
      } else {
        // Only apply filters when not searching
        if (campaignFilter) {
          const campaignId = parseInt(campaignFilter, 10);
          console.log(`Setting campaign filter to ${campaignId} (${typeof campaignId})`);
          searchParams.append("campaignId", campaignId.toString());
        }
        
        // Add status filter if it's not "all"
        if (statusFilter && statusFilter !== "all") {
          searchParams.append("status", statusFilter);
        }
      }
      
      const res = await fetch(`/api/original-url-records?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch original URL records");
      }
      return res.json();
    }
  });
  
  // Reset selected records when the record data changes
  useEffect(() => {
    if (recordsData?.records) {
      // Only keep selected records that still exist in the current data
      const existingIds = recordsData.records.map((record: any) => record.id);
      setSelectedRecords(prev => prev.filter(id => existingIds.includes(id)));
      
      // Update selectAll to be true only if all current records are selected
      const allSelected = 
        selectedRecords.length > 0 && 
        existingIds.length > 0 && 
        existingIds.every((id: number) => selectedRecords.includes(id));
        
      setSelectAll(allSelected);
    }
  }, [recordsData, selectedRecords]);

  // Mutation for creating a new original URL record
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      try {
        const res = await apiRequest("POST", "/api/original-url-records", data);
        const jsonData = await res.json();
        return jsonData;
      } catch (error) {
        console.error("Error in create mutation:", error);
        throw error;
      }
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
      try {
        const res = await apiRequest("PUT", `/api/original-url-records/${data.id}`, data.data);
        const jsonData = await res.json();
        return jsonData;
      } catch (error) {
        console.error("Error in update mutation:", error);
        throw error;
      }
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
      try {
        const res = await apiRequest("DELETE", `/api/original-url-records/${id}`);
        const jsonData = await res.json();
        return jsonData;
      } catch (error) {
        console.error("Error in delete mutation:", error);
        throw error;
      }
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
      try {
        const res = await apiRequest("POST", `/api/original-url-records/${id}/sync`);
        const jsonData = await res.json();
        return jsonData;
      } catch (error) {
        console.error("Error in sync mutation:", error);
        throw error;
      }
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
  
  // Mutation for pausing an original URL record
  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        // apiRequest already returns the parsed JSON data
        const data = await apiRequest("POST", `/api/original-url-records/${id}/pause`);
        return data;
      } catch (error) {
        console.error("Error in pause mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Original URL record paused. ${data.updatedUrlCount} URLs paused.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to pause record",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Mutation for resuming an original URL record
  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        // apiRequest already returns the parsed JSON data
        const data = await apiRequest("POST", `/api/original-url-records/${id}/resume`);
        return data;
      } catch (error) {
        console.error("Error in resume mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Original URL record resumed. ${data.updatedUrlCount} URLs resumed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resume record",
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
      status: record.status || 'active',
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
  
  const handlePauseClick = (id: number) => {
    pauseMutation.mutate(id);
  };
  
  const handleResumeClick = (id: number) => {
    resumeMutation.mutate(id);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Set current page back to 1 when searching
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  // Real-time search as user types
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Small delay for better user experience
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    // Set current page back to 1 when clearing search
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };
  
  // Status filter change handler
  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  // Fetch all campaigns for filtering
  const { data: campaignsData } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns");
      if (!res.ok) {
        throw new Error("Failed to fetch campaigns");
      }
      return res.json();
    }
  });

  // Bulk selection handlers
  const handleSelectRecord = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRecords(prev => [...prev, id]);
    } else {
      setSelectedRecords(prev => prev.filter(recordId => recordId !== id));
    }
  };

  const handleSelectAllRecords = (checked: boolean) => {
    setSelectAll(checked);
    if (checked && recordsData?.records) {
      setSelectedRecords(recordsData.records.map((record: any) => record.id));
    } else {
      setSelectedRecords([]);
    }
  };

  // Bulk actions
  const handleBulkPause = async () => {
    if (selectedRecords.length === 0) return;
    setBulkActionLoading(true);
    try {
      // Create a single request to pause all selected records
      // apiRequest already returns the parsed JSON data
      const result = await apiRequest("POST", "/api/original-url-records/bulk/pause", { ids: selectedRecords });
      
      toast({
        title: "Success",
        description: `${selectedRecords.length} records paused successfully.`,
      });
      
      // Refresh data after bulk action
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
      
      setSelectedRecords([]);
      setSelectAll(false);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to pause records: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkResume = async () => {
    if (selectedRecords.length === 0) return;
    setBulkActionLoading(true);
    try {
      // Create a single request to resume all selected records
      // apiRequest already returns the parsed JSON data
      const result = await apiRequest("POST", "/api/original-url-records/bulk/resume", { ids: selectedRecords });
      
      toast({
        title: "Success",
        description: `${selectedRecords.length} records resumed successfully.`,
      });
      
      // Refresh data after bulk action
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/urls"] });
      
      setSelectedRecords([]);
      setSelectAll(false);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to resume records: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) return;
    setBulkActionLoading(true);
    try {
      // Create a single request to delete all selected records
      // apiRequest already returns the parsed JSON data
      const result = await apiRequest("POST", "/api/original-url-records/bulk/delete", { ids: selectedRecords });
      
      toast({
        title: "Success",
        description: `${selectedRecords.length} records deleted successfully.`,
      });
      
      // Refresh data after bulk action
      queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
      
      setSelectedRecords([]);
      setSelectAll(false);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete records: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(parseInt(value));
    // Back to page 1 when changing page size
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
  };

  // Calculate total pages
  const totalPages = recordsData?.totalPages || 1;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <h2 className="text-xl font-bold text-destructive mb-2">Error</h2>
        <p className="text-muted-foreground">{(error as Error)?.message || "Failed to load records"}</p>
        <Button 
          variant="outline" 
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
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Original URL Records</h1>
          <Button
            onClick={() => fixClickProtectionMutation.mutate()}
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={fixClickProtectionMutation.isPending}
          >
            {fixClickProtectionMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Fixing...
              </>
            ) : (
              <>
                Fix Click Protection
              </>
            )}
          </Button>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create New
        </Button>
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
          <div className="flex flex-col gap-4 mb-4">
            {/* Search, filter, and pagination options */}
            <div className="flex flex-wrap gap-2">
              <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                <Input
                  placeholder="Search by name or URL..."
                  value={searchQuery}
                  onChange={handleSearchInputChange}
                  className="flex-1"
                />
                <Button type="submit" variant="outline">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                {searchQuery && (
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={handleClearSearch}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                )}
              </form>
              
              {/* Campaign filter dropdown */}
              <div className="w-[180px]">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Campaign Filter:</div>
                <select
                  value={campaignFilter || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      console.log('Clearing campaign filter');
                      setCampaignFilter(null);
                    } else {
                      // Convert to number
                      const numericValue = parseInt(value, 10);
                      console.log(`Setting campaign filter to: ${numericValue} (${typeof numericValue})`);
                      setCampaignFilter(numericValue.toString());
                    }
                    // Reset to page 1 when filter changes
                    setCurrentPage(1);
                    // Refresh data
                    queryClient.invalidateQueries({ queryKey: ["/api/original-url-records"] });
                  }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">All campaigns</option>
                  {campaignsData?.map((campaign: any) => (
                    <option key={campaign.id} value={campaign.id.toString()}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Status filter dropdown */}
              <div className="w-[150px]">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Status Filter:</div>
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active URLs</option>
                  <option value="paused">Paused URLs</option>
                  <option value="deleted">Deleted URLs</option>
                  <option value="completed">Completed URLs</option>
                  <option value="all">All URLs</option>
                </select>
              </div>
              
              {/* Records per page */}
              <div className="w-[150px]">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Records Per Page:</div>
                <select
                  value={pageSize.toString()}
                  onChange={(e) => handlePageSizeChange(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="5">5 per page</option>
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                  <option value="250">250 per page</option>
                  <option value="500">500 per page</option>
                  <option value="1000">1000 per page</option>
                </select>
              </div>
            </div>
            
            {/* Bulk Actions */}
            {selectedRecords.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <span className="text-sm font-medium mr-2">
                  {selectedRecords.length} records selected
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleBulkResume}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1"
                >
                  {bulkActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Activate
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleBulkPause}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1"
                >
                  {bulkActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                  Pause
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="flex items-center gap-1"
                >
                  {bulkActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => {
                    setSelectedRecords([]);
                    setSelectAll(false);
                  }}
                  className="ml-auto"
                >
                  Clear selection
                </Button>
              </div>
            )}
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
                      <TableHead className="w-[40px]">
                        <Checkbox 
                          checked={selectAll}
                          onCheckedChange={handleSelectAllRecords}
                          aria-label="Select all records"
                        />
                      </TableHead>
                      <TableHead className="w-[50px]">ID</TableHead>
                      <TableHead className="w-[200px]">Name</TableHead>
                      <TableHead className="w-[250px]">Target URL</TableHead>
                      <TableHead className="text-center">Click Limit</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[150px]">Last Updated</TableHead>
                      <TableHead className="text-right w-[220px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordsData?.records?.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRecords.includes(record.id)}
                            onCheckedChange={(checked) => handleSelectRecord(record.id, !!checked)}
                            aria-label={`Select record ${record.id}`}
                          />
                        </TableCell>
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
                        <TableCell>
                          {record.status === 'paused' ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Paused
                            </span>
                          ) : record.status === 'completed' ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                              Completed
                            </span>
                          ) : record.status === 'deleted' ? (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                              Deleted
                            </span>
                          ) : record.status === 'rejected' ? (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                              Rejected
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Active
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.updatedAt ? formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true }) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {record.status === 'paused' ? (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleResumeClick(record.id)}
                                title="Resume this URL"
                                className="text-green-500"
                                disabled={resumeMutation.isPending}
                              >
                                {resumeMutation.isPending && resumeMutation.variables === record.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handlePauseClick(record.id)}
                                title="Pause this URL"
                                className="text-amber-500"
                                disabled={pauseMutation.isPending}
                              >
                                {pauseMutation.isPending && pauseMutation.variables === record.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Pause className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleSyncClick(record.id)}
                              title="Sync with all linked URLs"
                              disabled={syncMutation.isPending && syncMutation.variables === record.id}
                            >
                              {syncMutation.isPending && syncMutation.variables === record.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEditClick(record)}
                              title="Edit record"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteClick(record.id)}
                              className="text-red-500"
                              title="Delete record"
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
                      <Input placeholder="URL name or identifier" {...field} />
                    </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="originalClickLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Click Limit</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1000" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      The maximum number of clicks allowed for this URL
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="deleted">Deleted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </FormControl>
                    <FormDescription>
                      Current status of this URL record
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
                      Saving...
                    </>
                  ) : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Original URL Record</DialogTitle>
            <DialogDescription>
              Add a new master URL record to the system.
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
                      <Input placeholder="URL name or identifier" {...field} />
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
                name="originalClickLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Click Limit</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="1000" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      The maximum number of clicks allowed for this URL
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
                  ) : "Create"}
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
              Are you sure you want to delete this original URL record? This action cannot be undone.
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
              onClick={() => recordToDelete !== null && deleteMutation.mutate(recordToDelete)}
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