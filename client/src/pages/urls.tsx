import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Search, 
  ArrowUp, 
  ArrowDown, 
  Filter, 
  Trash2, 
  Play, 
  Pause, 
  MoreHorizontal,
  Clipboard,
  Eye,
  ExternalLink,
  Check,
  Edit
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableRow, 
  TableCell 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UrlWithActiveStatus } from "@shared/schema";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import CampaignSidebar from "@/components/campaigns/campaign-sidebar";
import UrlEditForm from "@/components/urls/url-edit-form";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

// Table pagination component
function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange 
}: { 
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  
  return (
    <div className="flex items-center justify-center mt-4 gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </Button>
      
      {pages.map(page => (
        <Button
          key={page}
          variant={page === currentPage ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(page)}
          className="w-9 p-0"
        >
          {page}
        </Button>
      ))}
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </Button>
    </div>
  );
}

export default function URLsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedUrls, setSelectedUrls] = useState<number[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [permanentDeleteModalOpen, setPermanentDeleteModalOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState<UrlWithActiveStatus | null>(null);
  
  // Debounce search input
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    const timeout = setTimeout(() => {
      setDebouncedSearch(e.target.value);
      setPage(1); // Reset to first page on search
    }, 300);
    
    return () => clearTimeout(timeout);
  }, []);
  
  // Fetch URLs with pagination, search, and status filter
  const { data, isLoading, isError } = useQuery({
    queryKey: ['urls', page, limit, debouncedSearch, statusFilter],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.append('page', page.toString());
      searchParams.append('limit', limit.toString());
      
      if (debouncedSearch) {
        searchParams.append('search', debouncedSearch);
      }
      
      if (statusFilter !== 'all') {
        searchParams.append('status', statusFilter);
      }
      
      const response = await fetch(`/api/urls?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch URLs');
      }
      return response.json();
    }
  });
  
  const urls = data?.urls || [];
  const totalPages = data?.total ? Math.ceil(data.total / limit) : 1;
  
  // URL status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
    let label = status.charAt(0).toUpperCase() + status.slice(1);
    
    switch (status) {
      case 'active':
        variant = "default";
        break;
      case 'paused':
        variant = "secondary";
        break;
      case 'completed':
        variant = "outline";
        break;
      case 'deleted':
        variant = "destructive";
        break;
    }
    
    return <Badge variant={variant}>{label}</Badge>;
  };
  
  // Handle bulk selection
  const toggleSelectAll = () => {
    if (selectedUrls.length === urls.length) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(urls.map((url: UrlWithActiveStatus) => url.id));
    }
  };
  
  const toggleUrlSelection = (id: number) => {
    if (selectedUrls.includes(id)) {
      setSelectedUrls(selectedUrls.filter(urlId => urlId !== id));
    } else {
      setSelectedUrls([...selectedUrls, id]);
    }
  };
  
  // Bulk action mutations
  const bulkActionMutation = useMutation({
    mutationFn: async ({ urlIds, action }: { urlIds: number[], action: string }) => {
      return apiRequest('POST', '/api/urls/bulk', { urlIds, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      setSelectedUrls([]);
      toast({
        title: "Success",
        description: "Bulk action completed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to perform bulk action",
        variant: "destructive",
      });
      console.error("Bulk action failed:", error);
    }
  });
  
  // Handlers for bulk actions
  const handleBulkActivate = () => {
    bulkActionMutation.mutate({ urlIds: selectedUrls, action: 'activate' });
  };
  
  const handleBulkPause = () => {
    bulkActionMutation.mutate({ urlIds: selectedUrls, action: 'pause' });
  };
  
  const handleBulkDelete = () => {
    bulkActionMutation.mutate({ urlIds: selectedUrls, action: 'delete' });
    setDeleteModalOpen(false);
  };
  
  const handleBulkPermanentDelete = () => {
    bulkActionMutation.mutate({ urlIds: selectedUrls, action: 'permanent_delete' });
    setPermanentDeleteModalOpen(false);
  };
  
  // Copy URL to clipboard
  const handleCopyUrl = (url: UrlWithActiveStatus) => {
    const redirectUrl = `${window.location.origin}/r/${url.campaignId}/${url.id}`;
    navigator.clipboard.writeText(redirectUrl)
      .then(() => {
        toast({
          title: "URL Copied",
          description: "URL has been copied to clipboard",
        });
      })
      .catch(() => {
        toast({
          title: "Copy Failed",
          description: "Failed to copy URL to clipboard",
          variant: "destructive",
        });
      });
  };
  
  // Single URL action mutations
  const urlActionMutation = useMutation({
    mutationFn: async ({ id, action, data }: { id: number, action: string, data?: any }) => {
      if (action === 'update') {
        return apiRequest('PUT', `/api/urls/${id}`, data);
      } else if (action === 'delete') {
        return apiRequest('DELETE', `/api/urls/${id}`);
      } else if (action === 'permanent_delete') {
        return apiRequest('DELETE', `/api/urls/${id}/permanent`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['urls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: "Success",
        description: "URL updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update URL",
        variant: "destructive",
      });
      console.error("URL action failed:", error);
    }
  });
  
  // URL action handlers
  const handleActivateUrl = (id: number) => {
    // Find the URL in our data to get all its fields
    const url = urls.find((u: UrlWithActiveStatus) => u.id === id);
    if (!url) return;
    
    // Include all required fields when updating to fix the validation errors
    urlActionMutation.mutate({ 
      id, 
      action: 'update', 
      data: { 
        name: url.name,
        targetUrl: url.targetUrl,
        clickLimit: url.clickLimit,
        status: 'active' 
      } 
    });
  };
  
  const handlePauseUrl = (id: number) => {
    // Find the URL in our data to get all its fields
    const url = urls.find((u: UrlWithActiveStatus) => u.id === id);
    if (!url) return;
    
    // Include all required fields when updating to fix the validation errors
    urlActionMutation.mutate({ 
      id, 
      action: 'update', 
      data: { 
        name: url.name,
        targetUrl: url.targetUrl,
        clickLimit: url.clickLimit,
        status: 'paused' 
      } 
    });
  };
  
  const handleDeleteUrl = (id: number) => {
    urlActionMutation.mutate({ id, action: 'delete' });
  };
  
  const handlePermanentDeleteUrl = (id: number) => {
    urlActionMutation.mutate({ id, action: 'permanent_delete' });
  };
  
  // Visit URL directly
  const handleVisitUrl = (url: UrlWithActiveStatus) => {
    window.open(url.targetUrl, '_blank');
  };
  
  // Handle URL edit 
  const handleEditUrl = (url: UrlWithActiveStatus) => {
    setEditingUrl(url);
  };
  
  // Progress bar component showing clicks vs limit
  const ProgressBar = ({ url }: { url: UrlWithActiveStatus }) => {
    const percentage = Math.min(100, (url.clicks / url.clickLimit) * 100);
    
    return (
      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
        <div 
          className={`h-2.5 rounded-full ${percentage === 100 ? 'bg-gray-500' : 'bg-primary'}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen">
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">URL Management</h1>
              <p className="text-sm text-gray-500">Manage and track all your redirect URLs</p>
            </div>
            
            <div className="flex space-x-2 mt-4 md:mt-0">
              <Link href="/">
                <Button variant="outline">Back to Campaigns</Button>
              </Link>
            </div>
          </div>
          
          {/* Filters and search */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search URLs..."
                  value={search}
                  onChange={handleSearchChange}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1000</SelectItem>
                    <SelectItem value="2000">2000</SelectItem>
                    <SelectItem value="5000">5000</SelectItem>
                    <SelectItem value="9999">All URLs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Bulk actions (show only when items are selected) */}
            {selectedUrls.length > 0 && (
              <div className="mt-4 p-2 bg-gray-50 rounded border flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {selectedUrls.length} selected
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkActivate}
                    className="gap-1"
                  >
                    <Play className="h-3 w-3" />
                    Activate
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkPause}
                    className="gap-1"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </Button>
                  
                  <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete URLs</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {selectedUrls.length} URLs? This action will mark them as deleted, but they can be restored later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} className="bg-red-500 hover:bg-red-600">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  <AlertDialog open={permanentDeleteModalOpen} onOpenChange={setPermanentDeleteModalOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Permanent Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Permanently Delete URLs</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to permanently delete {selectedUrls.length} URLs? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkPermanentDelete} className="bg-red-600 hover:bg-red-700">
                          Permanently Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>

          {/* Select All action for all users */}
          {urls.length > 0 && selectedUrls.length === 0 && (
            <div className="mb-4 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                className="w-full gap-1 border-blue-300 text-blue-700"
              >
                <Check className="h-3 w-3" />
                Select All URLs on This Page ({urls.length})
              </Button>
            </div>
          )}
          
          {/* URLs Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox 
                        checked={urls.length > 0 && selectedUrls.length === urls.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all URLs"
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Target URL</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Clicks / Limit</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center">
                          <div className="h-10 w-10 rounded-full border-4 border-t-primary border-gray-200 animate-spin mb-2" />
                          <p className="text-gray-500">Loading URLs...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-red-500">
                        Error loading URLs. Please try again.
                      </TableCell>
                    </TableRow>
                  ) : urls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        No URLs found. Try adjusting your filters or search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    urls.map((url: UrlWithActiveStatus) => (
                      <TableRow key={url.id} className={url.status === 'deleted' ? 'opacity-60' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUrls.includes(url.id)}
                            onCheckedChange={() => toggleUrlSelection(url.id)}
                            aria-label={`Select URL ${url.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{url.id}</TableCell>
                        <TableCell className="font-medium">{url.name}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <a 
                            href={url.targetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {url.targetUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell>
                          {url.campaignId ? (
                            <Link href={`/campaigns/${url.campaignId}`}>
                              <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                                Campaign #{url.campaignId}
                              </Badge>
                            </Link>
                          ) : (
                            <span className="text-gray-400 text-sm">No campaign</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={url.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{url.clicks} / {url.clickLimit} / {url.originalClickLimit}</span>
                              {url.clicks >= url.clickLimit && (
                                <Check className="h-4 w-4 text-gray-500 ml-1" />
                              )}
                            </div>
                            <span className="text-xs text-gray-500 mb-1">
                              received / required / original
                            </span>
                            <ProgressBar url={url} />
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {formatDate(url.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleCopyUrl(url)}>
                                  <Clipboard className="h-4 w-4 mr-2" />
                                  Copy URL
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleVisitUrl(url)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Visit Target
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditUrl(url)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit URL
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                
                                {(url.status === 'paused' || url.status === 'completed') && (
                                  <DropdownMenuItem onClick={() => handleActivateUrl(url.id)}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                
                                {url.status === 'active' && (
                                  <DropdownMenuItem onClick={() => handlePauseUrl(url.id)}>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pause
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuSeparator />
                                
                                {url.status !== 'deleted' && (
                                  <DropdownMenuItem
                                    className="text-red-500 focus:text-red-500"
                                    onClick={() => handleDeleteUrl(url.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handlePermanentDeleteUrl(url.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Permanent Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            {!isLoading && !isError && urls.length > 0 && (
              <div className="p-4 border-t">
                <Pagination 
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* URL Edit Dialog */}
      <Dialog 
        open={editingUrl !== null} 
        onOpenChange={(open) => {
          if (!open) setEditingUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          {editingUrl && (
            <UrlEditForm 
              url={editingUrl} 
              onSuccess={() => {
                setEditingUrl(null);
                queryClient.invalidateQueries({ queryKey: ['urls'] });
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}