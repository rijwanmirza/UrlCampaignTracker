import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Clipboard, ExternalLink, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { UrlWithActiveStatus } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
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

interface CampaignUrlsProps {
  campaignId: number;
  urls: UrlWithActiveStatus[];
  onRefresh: () => void;
}

export default function CampaignUrls({ campaignId, urls, onRefresh }: CampaignUrlsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  
  // Get only active and paused URLs (not completed or deleted)
  const activeUrls = urls.filter(url => url.status === 'active' || url.status === 'paused');
  
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
  
  if (activeUrls.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-500 mb-4">No active URLs in this campaign.</p>
        <Link href={`/urls`}>
          <Button variant="outline" size="sm">View All URLs</Button>
        </Link>
      </div>
    );
  }
  
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Target URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Clicks</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activeUrls.map((url) => (
            <TableRow key={url.id}>
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
                    {url.clicks} / {url.clickLimit}
                  </span>
                  <ProgressBar url={url} />
                </div>
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
      
      {/* Delete confirmation dialog */}
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
    </div>
  );
}