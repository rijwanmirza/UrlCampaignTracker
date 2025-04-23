import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Clipboard, 
  Copy, 
  Edit, 
  ExternalLink, 
  Pause, 
  Play, 
  MoreHorizontal, 
  Trash2,
  Link,
  Search,
  Check
} from "lucide-react";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableCell, 
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CampaignWithUrls, UrlWithActiveStatus } from "@shared/schema";
import { formatDate } from "@/lib/utils";
import UrlForm from "./url-form";

interface UrlTableProps {
  campaign: CampaignWithUrls;
}

export default function UrlTable({ campaign }: UrlTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingUrl, setEditingUrl] = useState<UrlWithActiveStatus | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  
  // Search and filter states
  const [search, setSearch] = useState("");
  const [filteredUrls, setFilteredUrls] = useState<UrlWithActiveStatus[]>(campaign.urls);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUrls, setSelectedUrls] = useState<number[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Update filtered URLs when campaign data, search, or filter changes
  useEffect(() => {
    let result = [...campaign.urls];
    
    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        url => 
          url.name.toLowerCase().includes(searchLower) || 
          url.targetUrl.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter(url => url.status === statusFilter);
    }
    
    setFilteredUrls(result);
    // Reset to first page when filters change
    setCurrentPage(1);
    // Clear selection when filter changes
    setSelectedUrls([]);
  }, [campaign.urls, search, statusFilter]);
  
  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredUrls.length / pageSize));
  const paginatedUrls = filteredUrls.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  
  // Handle bulk selection
  const toggleSelectAll = () => {
    if (selectedUrls.length === paginatedUrls.length) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(paginatedUrls.map(url => url.id));
    }
  };
  
  const toggleUrlSelection = (id: number) => {
    if (selectedUrls.includes(id)) {
      setSelectedUrls(selectedUrls.filter(urlId => urlId !== id));
    } else {
      setSelectedUrls([...selectedUrls, id]);
    }
  };
  
  // URL mutation for status changes and deletion
  const urlActionMutation = useMutation({
    mutationFn: async ({ 
      urlId, 
      action, 
      data 
    }: { 
      urlId: number, 
      action: 'update' | 'delete', 
      data?: any 
    }) => {
      if (action === 'update') {
        return apiRequest('PUT', `/api/urls/${urlId}`, data);
      } else if (action === 'delete') {
        return apiRequest('DELETE', `/api/urls/${urlId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      
      toast({
        title: "Success",
        description: "URL has been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });
  
  // Handle URL actions
  const handleToggleUrlStatus = (url: UrlWithActiveStatus) => {
    const newStatus = url.status === 'active' ? 'paused' : 'active';
    
    urlActionMutation.mutate({
      urlId: url.id,
      action: 'update',
      data: { 
        name: url.name,
        targetUrl: url.targetUrl,
        clickLimit: url.clickLimit,
        status: newStatus 
      }
    });
  };
  
  const handleDeleteUrl = (urlId: number) => {
    urlActionMutation.mutate({
      urlId,
      action: 'delete'
    });
  };
  
  const handleEditUrl = (url: UrlWithActiveStatus) => {
    setEditingUrl(url);
    setShowEditForm(true);
  };
  
  // Copy URL to clipboard
  const handleCopyUrl = (url: UrlWithActiveStatus) => {
    const redirectUrl = `${window.location.origin}/r/${campaign.id}/${url.id}`;
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
  
  // Open target URL in new tab
  const handleOpenTargetUrl = (url: string) => {
    window.open(url, "_blank");
  };
  
  // URL Progress bar
  const UrlProgress = ({ url }: { url: UrlWithActiveStatus }) => {
    const percentage = Math.min(100, (url.clicks / url.clickLimit) * 100);
    const isCompleted = url.clicks >= url.clickLimit;
    
    return (
      <div className="flex flex-col space-y-1">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span className="font-medium">{url.clicks} / {url.clickLimit} / {url.originalClickLimit}</span>
          <span>received / required / original</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div 
            className={`h-2.5 rounded-full ${isCompleted ? 'bg-gray-400' : 'bg-primary'}`} 
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };
  
  // Bulk URL mutation
  const bulkActionMutation = useMutation({
    mutationFn: async (data: { ids: number[], action: string }) => {
      return apiRequest('POST', '/api/urls/bulk', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
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
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Bulk actions
  const handleBulkActivate = () => {
    if (selectedUrls.length === 0) return;
    bulkActionMutation.mutate({ ids: selectedUrls, action: 'activate' });
  };

  const handleBulkPause = () => {
    if (selectedUrls.length === 0) return;
    bulkActionMutation.mutate({ ids: selectedUrls, action: 'pause' });
  };

  const handleBulkDelete = () => {
    if (selectedUrls.length === 0) return;
    setDeleteModalOpen(true);
  };

  const confirmBulkDelete = () => {
    bulkActionMutation.mutate({ ids: selectedUrls, action: 'delete' });
    setDeleteModalOpen(false);
  };

  // Handle page change for pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Simple pagination component
  const Pagination = () => {
    const pages = [];
    const displayPages = 5;
    
    // Logic to handle pagination with ellipsis for many pages
    let startPage = Math.max(1, currentPage - Math.floor(displayPages / 2));
    let endPage = Math.min(totalPages, startPage + displayPages - 1);
    
    if (endPage - startPage + 1 < displayPages) {
      startPage = Math.max(1, endPage - displayPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return (
      <div className="flex items-center justify-between py-4">
        <div>
          <span className="text-sm text-gray-500">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredUrls.length)} of {filteredUrls.length} URLs
          </span>
        </div>
        <div className="flex space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {startPage > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
              >
                1
              </Button>
              {startPage > 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  ...
                </Button>
              )}
            </>
          )}
          {pages.map(page => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => handlePageChange(page)}
            >
              {page}
            </Button>
          ))}
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  ...
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
              >
                {totalPages}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
          >
            Last
          </Button>
        </div>
      </div>
    );
  };
  
  return (
    <>
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">URL Redirects</h2>
          <p className="text-sm text-gray-500">Manage the URLs in this campaign</p>
        </div>
        
        {/* Search and Filter Controls */}
        <div className="p-4 border-b flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4 md:items-center">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <Input
              type="text"
              placeholder="Search by name or URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex space-x-2 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Items per page" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 per page</SelectItem>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
                <SelectItem value="500">500 per page</SelectItem>
                <SelectItem value="1000">1000 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Bulk Actions */}
        {selectedUrls.length > 0 && (
          <div className="p-2 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{selectedUrls.length} URLs selected</span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkActivate}
                  className="flex items-center"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Activate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkPause}
                  className="flex items-center"
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkDelete}
                  className="flex items-center text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] pl-4">
                  <Checkbox 
                    checked={selectedUrls.length > 0 && selectedUrls.length === paginatedUrls.length} 
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all URLs"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUrls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Link className="h-10 w-10 mb-2 text-gray-300" />
                      <p className="text-sm">No URLs found</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setShowEditForm(true)}
                      >
                        Add new URL
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUrls.map((url) => (
                  <TableRow key={url.id} className={url.status === 'deleted' ? 'opacity-50' : ''}>
                    <TableCell className="pl-4">
                      <Checkbox 
                        checked={selectedUrls.includes(url.id)}
                        onCheckedChange={() => toggleUrlSelection(url.id)}
                        aria-label={`Select ${url.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{url.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="truncate max-w-[150px] mr-1">{url.targetUrl}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-full"
                          onClick={() => handleOpenTargetUrl(url.targetUrl)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          url.status === 'active' 
                            ? 'default' 
                            : url.status === 'paused' 
                              ? 'outline' 
                              : url.status === 'deleted' 
                                ? 'destructive' 
                                : 'secondary'
                        }
                      >
                        {url.status.charAt(0).toUpperCase() + url.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <UrlProgress url={url} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(url.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => handleCopyUrl(url)}>
                              <Copy className="h-4 w-4 mr-2" />
                              <span>Copy URL</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditUrl(url)}>
                              <Edit className="h-4 w-4 mr-2" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            
                            {url.status !== 'deleted' && (
                              <DropdownMenuItem onClick={() => handleToggleUrlStatus(url)}>
                                {url.status === 'active' ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    <span>Pause</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    <span>Activate</span>
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                          
                          {url.status !== 'deleted' && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete URL?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this URL? It will be marked as deleted 
                                      and will no longer receive traffic, but can be restored later.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUrl(url.id)}
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {filteredUrls.length > 0 && (
          <div className="p-4 border-t">
            <Pagination />
          </div>
        )}
      </div>
      
      {/* URL Edit Form */}
      <UrlForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        campaignId={campaign.id}
        editingUrl={editingUrl || undefined}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
          queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
          setEditingUrl(null);
        }}
      />
      
      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedUrls.length} URLs?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUrls.length} URLs? They will be marked as deleted 
              and will no longer receive traffic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}