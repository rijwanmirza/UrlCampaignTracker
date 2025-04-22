import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CampaignWithUrls, UrlWithActiveStatus } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Clipboard, Pencil, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/components/ui/use-toast";
import UrlForm from "./url-form";

interface UrlTableProps {
  campaign: CampaignWithUrls;
}

export default function UrlTable({ campaign }: UrlTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [editingUrl, setEditingUrl] = useState<UrlWithActiveStatus | null>(null);

  const deleteUrl = useMutation({
    mutationFn: async (urlId: number) => {
      await apiRequest("DELETE", `/api/urls/${urlId}`);
      return urlId;
    },
    onSuccess: (urlId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      
      toast({
        title: "URL Deleted",
        description: "The URL has been removed from the campaign",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete URL",
        variant: "destructive",
      });
    },
  });

  const handleAddUrl = () => {
    setEditingUrl(null);
    setShowUrlModal(true);
  };

  const handleEditUrl = (url: UrlWithActiveStatus) => {
    setEditingUrl(url);
    setShowUrlModal(true);
  };

  const handleDeleteUrl = (urlId: number) => {
    if (window.confirm("Are you sure you want to delete this URL?")) {
      deleteUrl.mutate(urlId);
    }
  };

  // We no longer need individual URL copy functionality as we're using the campaign URL

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Campaign URLs</h2>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Target URL</TableHead>
              <TableHead>Clicks</TableHead>
              <TableHead>Click Weight</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.urls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                  No URLs in this campaign yet.<br />
                  Click "Add URL" to add your first URL.
                </TableCell>
              </TableRow>
            ) : (
              campaign.urls.map((url) => (
                <TableRow key={url.id}>
                  <TableCell className="font-medium">{url.name}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs rounded-full font-semibold ${
                      url.isActive 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                    }`}>
                      {url.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{url.targetUrl}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm whitespace-nowrap">
                        {url.clicks} / {url.clickLimit}
                      </span>
                      <Progress 
                        className="h-2 w-20" 
                        value={Math.min(100, (url.clicks / url.clickLimit) * 100)} 
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm whitespace-nowrap">
                        {url.clickLimit}
                      </span>
                      <div className="text-xs text-gray-500">
                        {url.isActive 
                          ? `${url.clickLimit - url.clicks} remaining`
                          : "Limit reached"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditUrl(url)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => handleDeleteUrl(url.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <UrlForm 
        open={showUrlModal}
        onOpenChange={setShowUrlModal}
        campaignId={campaign.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
          queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
        }}
        editingUrl={editingUrl || undefined}
      />
    </div>
  );
}
