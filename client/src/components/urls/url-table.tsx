import { useState } from "react";
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
  Link
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
        <div className="flex justify-between text-xs text-gray-500">
          <span>{url.clicks} clicks</span>
          <span>{url.clickLimit} limit</span>
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
  
  return (
    <>
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">URL Redirects</h2>
          <p className="text-sm text-gray-500">Manage the URLs in this campaign</p>
        </div>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Target URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaign.urls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <Link className="h-10 w-10 mb-2 text-gray-300" />
                      <p className="text-sm">No URLs in this campaign yet</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => setShowEditForm(true)}
                      >
                        Add your first URL
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                campaign.urls.map((url) => (
                  <TableRow key={url.id} className={url.status === 'deleted' ? 'opacity-50' : ''}>
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
    </>
  );
}