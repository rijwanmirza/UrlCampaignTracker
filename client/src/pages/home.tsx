import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { formatCampaign } from "@/lib/types";
import CampaignSidebar from "@/components/campaigns/campaign-sidebar";
import UrlForm from "@/components/urls/url-form";
import UrlTable from "@/components/urls/url-table";
import StatsCards from "@/components/stats/stats-cards";

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUrlModal, setShowUrlModal] = useState(false);
  
  // Match the campaign ID from the URL
  const [match, params] = useRoute<{ id?: string }>("/campaigns/:id");
  const campaignId = match && params?.id ? parseInt(params.id) : undefined;
  
  // Fetch campaign data if we have an ID
  const { data: campaign, isLoading } = useQuery({
    queryKey: campaignId ? [`/api/campaigns/${campaignId}`] : null,
    enabled: !!campaignId,
  });

  const formattedCampaign = campaign ? formatCampaign(campaign) : undefined;

  const handleCopyCampaignUrl = () => {
    if (!campaign) return;
    
    const campaignUrl = `${window.location.origin}/c/${campaign.id}`;
    navigator.clipboard.writeText(campaignUrl)
      .then(() => {
        toast({
          title: "URL Copied",
          description: "Campaign URL has been copied to clipboard",
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <CampaignSidebar />
      
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {!campaignId || isLoading ? (
          <div className="h-full flex items-center justify-center flex-col p-8">
            <div className="text-center max-w-md">
              {isLoading ? (
                <div className="flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full border-4 border-t-primary border-gray-200 animate-spin mb-4" />
                  <h2 className="mt-4 text-xl font-semibold text-gray-700">Loading Campaign...</h2>
                </div>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <h2 className="mt-4 text-xl font-semibold text-gray-700">No Campaign Selected</h2>
                  <p className="mt-2 text-gray-500">
                    Select a campaign from the sidebar or create a new one to get started with URL redirection.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : formattedCampaign ? (
          <div className="p-6">
            {/* Campaign header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{formattedCampaign.name}</h1>
                <p className="text-sm text-gray-500">
                  <span>Created: </span>
                  <span>{formatDate(formattedCampaign.createdAt)}</span>
                </p>
              </div>
              <div className="mt-4 md:mt-0 flex space-x-3">
                <Button 
                  variant="outline"
                  onClick={handleCopyCampaignUrl}
                  className="gap-1.5"
                >
                  <Clipboard className="h-4 w-4" />
                  Copy URL
                </Button>
                <Button onClick={() => setShowUrlModal(true)}>
                  Add URL
                </Button>
              </div>
            </div>
            
            {/* Stats summary cards */}
            <StatsCards campaign={formattedCampaign} />
            
            {/* URLs list */}
            <UrlTable campaign={formattedCampaign} />
            
            {/* URL Form Modal */}
            <UrlForm 
              open={showUrlModal}
              onOpenChange={setShowUrlModal}
              campaignId={formattedCampaign.id}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${formattedCampaign.id}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
              }}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
