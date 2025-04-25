import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, List, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCampaign } from "@/lib/types";
import { CampaignWithUrls } from "@shared/schema";
import CampaignSidebar from "@/components/campaigns/campaign-sidebar";
import CampaignDetails from "@/components/campaigns/campaign-details";
import CampaignUrls from "@/components/campaigns/campaign-urls";
import UrlForm from "@/components/urls/url-form";
import StatsCards from "@/components/stats/stats-cards";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUrlModal, setShowUrlModal] = useState(false);
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Match the campaign ID from the URL
  const [match, params] = useRoute<{ id?: string }>("/campaigns/:id");
  const campaignId = match && params?.id ? parseInt(params.id) : undefined;
  
  // Fetch all campaigns for mobile dropdown
  const { data: allCampaigns } = useQuery<CampaignWithUrls[]>({
    queryKey: ['/api/campaigns'],
  });
  
  // Fetch campaign data if we have an ID
  const { data: campaign, isLoading } = useQuery<CampaignWithUrls>({
    queryKey: campaignId ? [`/api/campaigns/${campaignId}`] : ['empty-query'],
    enabled: !!campaignId,
  });

  const formattedCampaign = campaign ? formatCampaign(campaign) : undefined;

  // Don't auto-redirect to first campaign
  // Just display the selected campaign details

  // Generate the campaign URL for redirection
  const getCampaignUrl = (id: number) => {
    return `${window.location.origin}/c/${id}`;
  };

  const handleCopyCampaignUrl = () => {
    if (!campaign) return;
    
    const campaignUrl = getCampaignUrl(campaign.id);
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
  
  // Handler for mobile campaign selector
  const handleCampaignChange = (value: string) => {
    setLocation(`/campaigns/${value}`);
  };

  return (
    <div className="flex flex-col">
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {/* Campaign header - no dropdown */}
        
        {/* No Campaign or Loading State */}
        {!campaignId || isLoading ? (
          <div className="h-full flex items-center justify-center flex-col p-6">
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
                    Please select a campaign from the Campaigns page or create a new one to get started.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : formattedCampaign ? (
          <div className="p-4 md:p-6">
            {/* Campaign header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl md:text-2xl font-bold text-gray-800">{formattedCampaign.name}</h1>
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
                <Button 
                  variant="outline"
                  onClick={handleCopyCampaignUrl}
                  className="gap-1.5 flex-1 md:flex-none"
                  size={isMobile ? "sm" : "default"}
                >
                  <Clipboard className="h-4 w-4" />
                  Copy URL
                </Button>
                <Button 
                  onClick={() => setShowUrlModal(true)}
                  className="flex-1 md:flex-none"
                  size={isMobile ? "sm" : "default"}
                >
                  Add URL
                </Button>
              </div>
            </div>
            
            {/* Campaign details and URLs */}
            <CampaignDetails campaign={formattedCampaign} />
            
            {/* Stats summary cards */}
            <StatsCards campaign={formattedCampaign} />
            
            {/* Section headers with IDs */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mt-8 mb-4 gap-3">
              <div className="flex flex-col md:flex-row md:items-center">
                <h2 className="text-lg md:text-xl font-bold">Active URLs</h2>
                <span className="md:ml-3 text-xs md:text-sm text-gray-500">
                  Only showing active & paused URLs (completed URLs are removed)
                </span>
              </div>
              
              <Link href="/urls">
                <Button variant="outline" size="sm" className="gap-1.5 w-full md:w-auto">
                  <List className="h-4 w-4" />
                  View URL History
                </Button>
              </Link>
            </div>
            
            {/* Only active URLs list - explicitly filter out completed URLs */}
            <CampaignUrls 
              campaignId={formattedCampaign.id} 
              urls={formattedCampaign.urls.filter(url => url.status !== 'completed')}
              campaign={campaign}
              onRefresh={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${formattedCampaign.id}`] });
              }}
            />
            
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
