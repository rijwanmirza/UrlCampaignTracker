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
  Edit,
  X
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
  const isMobile = useIsMobile();
  
  return (
    <div className="flex items-center justify-center mt-4 gap-1 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </Button>
      
      {!isMobile && pages.map(page => (
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
      
      {isMobile && (
        <span className="px-2 text-sm">
          Page {currentPage} of {totalPages}
        </span>
      )}
      
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
      case 'rejected':
        variant = "destructive";
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
          variant: "success",
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
        <div className="p-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">URL History</h1>
              <p className="text-xs md:text-sm text-gray-500">Manage and track all your redirect URLs</p>
            </div>
            
            <div className="flex space-x-2 mt-3 md:mt-0 w-full md:w-auto">
              <Link href="/campaigns" className="w-full md:w-auto">
                <Button variant="outline" size="sm" className="w-full md:w-auto">
                  Back to Campaigns
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Filters and search */}
          <div className="bg-white rounded-lg shadow p-3 mb-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
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
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                  <SelectTrigger className="w-24">
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
              <div className="mt-3 p-2 bg-gray-50 rounded border flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {selectedUrls.length} selected
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
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
          {urls.length > 0 && (
            <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                className="w-full gap-1 border-blue-300 text-blue-700"
              >
                {selectedUrls.length === urls.length ? (
                  <>
                    <X className="h-3 w-3" />
                    Deselect All URLs
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    Select All URLs on This Page ({urls.length})
                  </>
                )}
              </Button>
            </div>
          )}
          
          {/* Mobile card view for URLs */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-primary border-gray-200"></div>
              </div>
            ) : isError ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-red-500">
                Error loading URLs. Please try again.
              </div>
            ) : urls.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <div className="flex flex-col items-center text-gray-500">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-10 w-10 mb-2" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p>No URLs found</p>
                </div>
              </div>
            ) : (
              urls.map((url: UrlWithActiveStatus) => (
                <Card key={url.id} className={url.status === 'deleted' ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-2">
                        <Checkbox 
                          checked={selectedUrls.includes(url.id)}
                          onCheckedChange={() => toggleUrlSelection(url.id)}
                          aria-label={`Select URL ${url.id}`}
                          className="mt-1"
                        />
                        <div>
                          <CardTitle className="text-base">{url.name}</CardTitle>
                          <CardDescription className="mt-1 text-xs">ID: {url.id}</CardDescription>
                        </div>
                      </div>
                      <StatusBadge status={url.status} />
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-2 pt-0 px-4">
                    <div className="text-sm mb-2 truncate">
                      <a 
                        href={url.targetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center"
                      >
                        {url.targetUrl}
                        <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                      </a>
                    </div>
                    
                    {url.campaignId && (
                      <div className="mb-2">
                        <Link href={`/campaigns/${url.campaignId}`}>
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                            Campaign #{url.campaignId}
                          </span>
                        </Link>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="text-gray-500 text-xs">
                        {formatDate(url.createdAt)}
                      </span>
                      <span className="whitespace-nowrap font-medium text-xs">
                        {url.clicks} / {url.clickLimit} / {url.originalClickLimit}
                      </span>
                    </div>
                    
                    <ProgressBar url={url} />
                  </CardContent>
                  
                  <CardFooter className="pt-2 px-4 pb-3 flex justify-between gap-2 border-t flex-wrap">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => handleCopyUrl(url)}
                      >
                        <Clipboard className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => handleVisitUrl(url)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => handleEditUrl(url)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="flex gap-1">
                      {url.status === 'active' ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8"
                          onClick={() => handlePauseUrl(url.id)}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      ) : (url.status === 'paused' || url.status === 'completed') ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8"
                          onClick={() => handleActivateUrl(url.id)}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Activate
                        </Button>
                      ) : null}
                      
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 text-red-600 border-red-200"
                        onClick={url.status !== 'deleted' ? 
                          () => handleDeleteUrl(url.id) : 
                          () => handlePermanentDeleteUrl(url.id)
                        }
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {url.status !== 'deleted' ? 'Delete' : 'Permanent'}
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>

          {/* Pagination */}
          {urls.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>
      
      {/* URL edit dialog */}
      {editingUrl && (
        <Dialog open={!!editingUrl} onOpenChange={(open) => !open && setEditingUrl(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <UrlEditForm 
              url={editingUrl} 
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['urls'] });
                setEditingUrl(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}