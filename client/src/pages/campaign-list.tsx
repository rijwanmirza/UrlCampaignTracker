import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  PlusCircle, 
  Edit, 
  Trash2, 
  MoreHorizontal,
  Copy,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableRow, 
  TableCell 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campaign, CampaignWithUrls } from "@shared/schema";
import CampaignForm from "@/components/campaigns/campaign-form";

// Calculate total price for a campaign based only on active URLs
const calculateTotalPrice = (campaign: CampaignWithUrls): string => {
  if (!campaign.pricePerThousand || !campaign.urls || campaign.urls.length === 0) return "0.0000";
  
  // Only consider active URLs
  const activeUrls = campaign.urls.filter(url => url.isActive);
  
  const pricePerThousand = Number(campaign.pricePerThousand);
  const totalClicks = activeUrls.reduce((sum, url) => sum + url.clickLimit, 0);
  const totalPrice = (pricePerThousand * totalClicks) / 1000;
  
  return totalPrice.toFixed(4);
};

// Calculate remaining price based on clicks already received, only for active URLs
const calculateRemainingPrice = (campaign: CampaignWithUrls): string => {
  if (!campaign.pricePerThousand || !campaign.urls || campaign.urls.length === 0) return "0.0000";
  
  // Only consider active URLs
  const activeUrls = campaign.urls.filter(url => url.isActive);
  
  const pricePerThousand = Number(campaign.pricePerThousand);
  const remainingClicks = activeUrls.reduce((sum, url) => sum + (url.clickLimit - url.clicks), 0);
  const remainingPrice = (pricePerThousand * remainingClicks) / 1000;
  
  return remainingPrice.toFixed(4);
};

export default function CampaignList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<number | null>(null);
  const isMobile = useIsMobile();

  // Fetch all campaigns
  const { data: campaigns = [], isLoading } = useQuery<CampaignWithUrls[]>({
    queryKey: ['/api/campaigns'],
  });

  // Filter campaigns by search term
  const filteredCampaigns = campaigns.filter(
    (campaign) => campaign.name.toLowerCase().includes(search.toLowerCase())
  );

  // Delete campaign mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: "Campaign Deleted",
        description: "The campaign has been deleted successfully",
      });
      setDeleteModalOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete campaign. Please try again.",
        variant: "destructive",
      });
      console.error("Campaign deletion failed:", error);
    }
  });

  // Handle campaign delete
  const handleDeleteCampaign = (id: number) => {
    setCampaignToDelete(id);
    setDeleteModalOpen(true);
  };

  // Handle confirm delete
  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete);
    }
  };

  // Handle copy campaign URL
  const handleCopyCampaignUrl = (id: number) => {
    const campaignUrl = `${window.location.origin}/c/${id}`;
    navigator.clipboard.writeText(campaignUrl)
      .then(() => {
        toast({
          title: "URL Copied",
          description: "Campaign rotation URL has been copied to clipboard",
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

  // Handle edit campaign
  const handleEditCampaign = (id: number) => {
    setLocation(`/campaigns/${id}`);
  };

  return (
    <div className="min-h-screen">
      <main className="flex-1 overflow-y-auto bg-gray-50" style={{ paddingBottom: '5rem' }}>
        <div className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Campaigns</h1>
              <p className="text-sm text-gray-500">Manage your redirect campaigns</p>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-2">
              <Button onClick={() => setShowCreateModal(true)}>
                <PlusCircle className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </div>
          </div>
          
          {/* Search bar */}
          <div className="mb-6">
            <Input
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
          
          {/* Campaigns list */}
          {isMobile ? (
            // Mobile card view
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-primary border-gray-200"></div>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <Card className="bg-white">
                  <CardContent className="pt-6 pb-6 text-center">
                    <p className="text-gray-500">No campaigns found</p>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateModal(true)}
                      className="mt-4"
                    >
                      Create your first campaign
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                filteredCampaigns.map((campaign) => (
                  <Card key={campaign.id} className="bg-white">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{campaign.name}</CardTitle>
                          <CardDescription>ID: {campaign.id}</CardDescription>
                        </div>
                        <Badge variant="outline">
                          {campaign.redirectMethod}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="mt-1 space-y-2">
                        {campaign.customPath && (
                          <div className="text-sm">
                            <span className="text-gray-500">Custom Path: </span>
                            <span className="font-medium">{campaign.customPath}</span>
                          </div>
                        )}
                        <div className="text-sm">
                          <span className="text-gray-500">Created: </span>
                          <span>{formatDate(campaign.createdAt)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">URLs: </span>
                          <span className="font-medium">{campaign.urls.length}</span>
                          <span className="text-gray-500 ml-2">Active: </span>
                          <span className="font-medium">{campaign.urls.filter(u => u.isActive).length}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Multiplier: </span>
                          <span className="font-medium">{campaign.multiplier}x</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Price per 1000: </span>
                          <span className="font-medium">${typeof campaign.pricePerThousand === 'string' 
                            ? parseFloat(campaign.pricePerThousand).toFixed(4) 
                            : (Number(campaign.pricePerThousand || 0)).toFixed(4)}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Campaign Price: </span>
                          <span className="font-medium">
                            ${calculateRemainingPrice(campaign)}/${calculateTotalPrice(campaign)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                    <CardContent className="pt-0 pb-4 border-t flex justify-between">
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleCopyCampaignUrl(campaign.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(`/c/${campaign.id}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCampaign(campaign.id)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-100"
                          onClick={() => handleDeleteCampaign(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            // Desktop table view
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Custom Path</TableHead>
                    <TableHead>Redirect Method</TableHead>
                    <TableHead>URLs (Active/Total)</TableHead>
                    <TableHead>Multiplier</TableHead>
                    <TableHead>Price per 1000</TableHead>
                    <TableHead>Campaign Price</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center h-24">
                        <div className="flex justify-center">
                          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center h-24">
                        <div className="flex flex-col items-center">
                          <p className="text-gray-500 mb-4">No campaigns found</p>
                          <Button onClick={() => setShowCreateModal(true)}>
                            Create your first campaign
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCampaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-mono text-xs">{campaign.id}</TableCell>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell>
                          {campaign.customPath ? (
                            <Badge variant="outline">{campaign.customPath}</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge>{campaign.redirectMethod}</Badge>
                        </TableCell>
                        <TableCell>
                          {campaign.urls.filter(u => u.isActive).length} / {campaign.urls.length}
                        </TableCell>
                        <TableCell>
                          {campaign.multiplier}x
                        </TableCell>
                        <TableCell>
                          ${typeof campaign.pricePerThousand === 'string' 
                            ? parseFloat(campaign.pricePerThousand).toFixed(4) 
                            : (Number(campaign.pricePerThousand || 0)).toFixed(4)}
                        </TableCell>
                        <TableCell>
                          ${calculateRemainingPrice(campaign)}/${calculateTotalPrice(campaign)}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {formatDate(campaign.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleCopyCampaignUrl(campaign.id)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy URL
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => window.open(`/c/${campaign.id}`, '_blank')}
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Open Redirect
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEditCampaign(campaign.id)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Campaign
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteCampaign(campaign.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Campaign
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
          )}
        </div>
      </main>
      
      {/* Create Campaign Modal */}
      <CampaignForm
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={(campaign: Campaign) => {
          setShowCreateModal(false);
          toast({
            title: "Campaign Created",
            description: "Your new campaign has been created successfully",
          });
          queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
        }}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this campaign? This will also mark all associated URLs as deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCampaignToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}