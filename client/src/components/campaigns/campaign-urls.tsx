import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Clipboard, 
  Edit, 
  ExternalLink, 
  MoreHorizontal, 
  Pause, 
  Play, 
  Trash2,
  Search,
  Filter,
  Check
} from "lucide-react";
import { Url, UrlWithActiveStatus, Campaign } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import UrlEditForm from "@/components/urls/url-edit-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
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
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

interface CampaignUrlsProps {
  campaignId: number;
  urls: UrlWithActiveStatus[];
  onRefresh: () => void;
  campaign?: Campaign; // Make campaign optional
}

export default function CampaignUrls({ campaignId, urls, onRefresh, campaign }: CampaignUrlsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState<UrlWithActiveStatus | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [displayLimit, setDisplayLimit] = useState(10);
  const [selectedUrls, setSelectedUrls] = useState<number[]>([]);
  
  // Filter URLs based on search term and status
  const filteredUrls = urls.filter(url => {
    // Apply search filter
    const matchesSearch = search === "" || 
      url.name.toLowerCase().includes(search.toLowerCase()) ||
      url.targetUrl.toLowerCase().includes(search.toLowerCase());
    
    // ALWAYS exclude completed URLs from campaign view
    if (url.status === 'completed') {
      return false;
    }
    
    // Apply status filter
    let matchesStatus = true;
    if (statusFilter !== "all") {
      matchesStatus = url.status === statusFilter;
    } else {
      // When on "all" status, still filter out deleted URLs
      matchesStatus = url.status !== "deleted";
    }
    
    return matchesSearch && matchesStatus;
  });
  
  // Sort URLs by ID descending (newest first)
  const sortedUrls = [...filteredUrls].sort((a, b) => b.id - a.id);
  
  // FORCE all users to have higher limits by default, regardless of device
  // This ensures everyone can see more URLs regardless of device detection
  const effectiveDisplayLimit = Math.max(9999, displayLimit);
  
  // Apply limit to the displayed URLs
  const displayedUrls = sortedUrls.slice(0, effectiveDisplayLimit);
  
  // URL action mutation
  const urlActionMutation = useMutation({
    mutationFn: async ({ id, action, data }: { id: number; action: string; data?: any }) => {
      if (action === 'update') {
        const response = await apiRequest(
          "PUT", 
          `/api/urls/${id}`, 
          data
        );
        return response.json();
      } else if (action === 'delete') {
        await apiRequest(
          "DELETE", 
          `/api/urls/${id}`
        );
        return { id };
      }
    },
    onSuccess: () => {
      // Close delete modal
      setDeleteModalOpen(false);
      setDeleteId(null);
      
      // Invalidate cached campaign data
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      
      // Refresh the parent component
      if (onRefresh) {
        onRefresh();
      }
      
      toast({
        title: "URL Updated",
        description: "The URL status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Action Failed",
        description: "Failed to perform action. Please try again.",
        variant: "destructive",
      });
      console.error("URL action failed:", error);
    }
  });
  
  // URL action handlers
  const handleActivateUrl = (id: number) => {
    const url = urls.find(url => url.id === id);
    if (!url) return;
    
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
    const url = urls.find(url => url.id === id);
    if (!url) return;
    
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
  
  const handleDeleteUrl = () => {
    if (deleteId) {
      urlActionMutation.mutate({ id: deleteId, action: 'delete' });
    }
  };
  
  // Handle copy URL
  const handleCopyUrl = (url: UrlWithActiveStatus) => {
    const redirectUrl = `${window.location.origin}/r/${campaignId}/${url.id}`;
    
    navigator.clipboard.writeText(redirectUrl)
      .then(() => {
        toast({
          title: "URL Copied",
          description: "The URL has been copied to clipboard",
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
  
  // Handle bulk selection
  const toggleSelectAll = () => {
    if (selectedUrls.length === displayedUrls.length) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(displayedUrls.map(url => url.id));
    }
  };

  const toggleUrlSelection = (id: number) => {
    if (selectedUrls.includes(id)) {
      setSelectedUrls(selectedUrls.filter(urlId => urlId !== id));
    } else {
      setSelectedUrls([...selectedUrls, id]);
    }
  };
  
  // Bulk action mutation
  const bulkActionMutation = useMutation({
    mutationFn: async ({ urlIds, action }: { urlIds: number[], action: string }) => {
      return apiRequest('POST', '/api/urls/bulk', { urlIds, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
      setSelectedUrls([]);
      setBulkDeleteModalOpen(false);
      
      // Refresh the parent component
      if (onRefresh) {
        onRefresh();
      }
      
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
  };
  
  if (filteredUrls.length === 0) {
    return (
      <div className="space-y-4">
        {/* Search and filter controls */}
        <div className="flex flex-col md:flex-row gap-3 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search URLs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                {/* Completed URLs are not shown in campaign views */}
              </SelectContent>
            </Select>
            
            <Select value={displayLimit.toString()} onValueChange={(value) => setDisplayLimit(parseInt(value))}>
              <SelectTrigger className="w-[80px]">
                <SelectValue placeholder="Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
                {/* Show higher URL limits for everyone */}
                <>
                  <SelectItem value="2000">2000</SelectItem>
                  <SelectItem value="5000">5000</SelectItem>
                  <SelectItem value="9999">All URLs</SelectItem>
                </>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-500 mb-4">No URLs found matching your filters.</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}>Clear Filters</Button>
            <Link href={`/urls`}>
              <Button variant="outline" size="sm">View All URLs</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Search and filter controls */}
      <div className="flex flex-col md:flex-row gap-3 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search URLs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              {/* Completed URLs are not shown in campaign views */}
            </SelectContent>
          </Select>
          
          <Select value={displayLimit.toString()} onValueChange={(value) => setDisplayLimit(parseInt(value))}>
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder="Limit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="1000">1000</SelectItem>
              {/* Show higher URL limits for everyone */}
              <>
                <SelectItem value="2000">2000</SelectItem>
                <SelectItem value="5000">5000</SelectItem>
                <SelectItem value="9999">All URLs</SelectItem>
              </>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Select All action - visible for all users */}
      {displayedUrls.length > 0 && selectedUrls.length === 0 && (
        <div className="p-2 bg-blue-50 rounded border border-blue-200 mb-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1 border-blue-300 text-blue-700"
            onClick={toggleSelectAll}
          >
            <Check className="h-3 w-3" />
            Select All URLs on This Page ({displayedUrls.length})
          </Button>
        </div>
      )}
      
      {/* Bulk actions (show only when items are selected) */}
      {selectedUrls.length > 0 && (
        <div className="p-2 bg-gray-50 rounded border flex flex-wrap items-center gap-2 mb-2">
          <span className="text-sm font-medium text-gray-700">
            {selectedUrls.length} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {/* Select/Deselect All button - Visible for everyone */}
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
                className="gap-1"
              >
                {selectedUrls.length === displayedUrls.length ? (
                  <>
                    <Trash2 className="h-3 w-3" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    Select All
                  </>
                )}
              </Button>
            
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
            
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => setBulkDeleteModalOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      )}
      
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={selectedUrls.length > 0 && selectedUrls.length === displayedUrls.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-[40px]">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Target URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedUrls.map((url) => (
              <TableRow key={url.id}>
                <TableCell className="px-2">
                  <Checkbox 
                    checked={selectedUrls.includes(url.id)}
                    onCheckedChange={() => toggleUrlSelection(url.id)}
                    aria-label={`Select URL ${url.id}`}
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
                  <Badge
                    variant={url.status === 'active' ? 'default' : 'secondary'}
                    className="capitalize"
                  >
                    {url.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {url.clicks} / {url.clickLimit} / {url.originalClickLimit}
                    </span>
                    <span className="text-xs text-gray-500 mb-1">
                      received / required / original
                    </span>
                    <ProgressBar url={url} />
                  </div>
                </TableCell>
                <TableCell>
                  {campaign && campaign.pricePerThousand ? (
                    <span>
                      ${((Number(campaign.pricePerThousand) * (url.clickLimit - url.clicks)) / 1000).toFixed(4)}/${((Number(campaign.pricePerThousand) * url.clickLimit) / 1000).toFixed(4)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyUrl(url)}
                      title="Copy URL"
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => {
                            setEditingUrl(url);
                            setEditModalOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit URL
                        </DropdownMenuItem>

                        {url.status === 'paused' && (
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
                        
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            setDeleteId(url.id);
                            setDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Single URL delete confirmation dialog */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete URL</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this URL? This action will mark it as deleted but it can be viewed in the URL history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUrl}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteModalOpen} onOpenChange={setBulkDeleteModalOpen}>
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
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* URL Edit Dialog */}
      <Dialog 
        open={editModalOpen} 
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) setEditingUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          {editingUrl && (
            <UrlEditForm 
              url={editingUrl} 
              onSuccess={() => {
                setEditModalOpen(false);
                setEditingUrl(null);
                // Refresh the parent component
                if (onRefresh) {
                  onRefresh();
                }
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}