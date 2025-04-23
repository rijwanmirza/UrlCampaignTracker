import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CampaignWithUrls } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Grid, BarChart, Link as LinkIcon } from "lucide-react";
import { formatCampaign } from "@/lib/types";
import CampaignForm from "./campaign-form";

export default function CampaignSidebar() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showNewCampaignForm, setShowNewCampaignForm] = useState(false);
  
  const { data: campaigns = [], isLoading } = useQuery<CampaignWithUrls[]>({
    queryKey: ['/api/campaigns'],
  });

  const handleSelectCampaign = (campaignId: number) => {
    setLocation(`/campaigns/${campaignId}`);
  };

  const getTotalActiveUrls = () => {
    return campaigns.reduce((total, campaign) => {
      return total + campaign.urls.filter(url => url.clicks < url.clickLimit).length;
    }, 0);
  };

  return (
    <aside className="bg-white border-r border-gray-200 w-full md:w-64 md:flex-shrink-0 md:overflow-y-auto flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">URL Redirector</h1>
        <p className="text-sm text-gray-500">Campaign Management</p>
      </div>
      
      <div className="px-4 py-2 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-600">CAMPAIGNS</h2>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => setShowNewCampaignForm(true)}
          aria-label="Add new campaign"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <nav className="mt-2 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-gray-500">
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No campaigns yet.<br />
            Click the + button to add one.
          </div>
        ) : (
          <ul className="space-y-1 px-2">
            {campaigns.map((campaign) => {
              const formattedCampaign = formatCampaign(campaign);
              return (
                <li key={campaign.id}>
                  <Button 
                    variant="ghost"
                    className="w-full justify-between px-3 py-2 h-auto"
                    onClick={() => handleSelectCampaign(campaign.id)}
                  >
                    <span className="truncate text-left">{campaign.name}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">
                      {formattedCampaign.activeUrlCount}/{campaign.urls.length}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      
      <div className="px-2 py-4 border-t border-gray-200">
        <div className="text-xs font-semibold text-gray-500 px-2 mb-2">NAVIGATION</div>
        <ul className="space-y-1">
          <li>
            <Link href="/">
              <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-100 cursor-pointer">
                <Grid className="h-4 w-4 text-gray-500" />
                <span>Campaigns</span>
              </div>
            </Link>
          </li>
          <li>
            <Link href="/urls">
              <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-gray-100 cursor-pointer">
                <LinkIcon className="h-4 w-4 text-gray-500" />
                <span>URL Management</span>
              </div>
            </Link>
          </li>
        </ul>
      </div>
      
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex items-center text-sm text-gray-500">
          <span className="font-medium mr-2">Total Active URLs:</span>
          <span>{getTotalActiveUrls()}</span>
        </div>
      </div>

      <CampaignForm 
        open={showNewCampaignForm} 
        onOpenChange={setShowNewCampaignForm}
        onSuccess={(newCampaign) => {
          queryClient.invalidateQueries({queryKey: ['/api/campaigns']});
          setLocation(`/campaigns/${newCampaign.id}`);
        }}
      />
    </aside>
  );
}
