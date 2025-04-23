import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Filter, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Campaign, RedirectMethod } from "@shared/schema";
import CampaignForm from "./campaign-form";

export default function CampaignSidebar() {
  const [_, setLocation] = useLocation();
  const [match, params] = useRoute<{ id?: string }>("/campaigns/:id");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  
  // Fetch campaigns
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
  });
  
  // Get active campaign ID
  const activeCampaignId = match && params?.id ? parseInt(params.id) : undefined;
  
  // Filter campaigns by search term
  const filteredCampaigns = campaigns.filter((campaign) => 
    campaign.name.toLowerCase().includes(search.toLowerCase())
  );
  
  // Navigate to campaign
  const handleNavigateToCampaign = (campaignId: number) => {
    setLocation(`/campaigns/${campaignId}`);
  };
  
  // Format redirect method for display
  const getRedirectMethodBadge = (method: string) => {
    switch (method) {
      case RedirectMethod.DIRECT:
        return "Direct";
      case RedirectMethod.META_REFRESH:
        return "Meta";
      case RedirectMethod.DOUBLE_META_REFRESH:
        return "Double Meta";
      case RedirectMethod.HTTP_307:
        return "HTTP 307";
      default:
        return method;
    }
  };
  
  return (
    <div className="w-full md:w-64 border-r flex flex-col bg-white h-screen">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center">
            <LayoutGrid className="h-5 w-5 mr-2 text-primary" />
            Campaigns
          </h2>
        </div>
        
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            type="search"
            placeholder="Search campaigns..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <Button 
          className="w-full" 
          onClick={() => setShowNewCampaignModal(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-2">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {search ? (
              <>
                <p>No campaigns match your search</p>
                <Button 
                  variant="link" 
                  className="mt-1 h-auto p-0"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </Button>
              </>
            ) : (
              <p>No campaigns yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className={cn(
                  "p-2 rounded-md cursor-pointer hover:bg-gray-100 transition-colors relative group",
                  activeCampaignId === campaign.id && "bg-gray-100"
                )}
                onClick={() => handleNavigateToCampaign(campaign.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="truncate flex-1">
                    <p className={cn(
                      "font-medium truncate",
                      activeCampaignId === campaign.id && "text-primary"
                    )}>
                      {campaign.name}
                    </p>
                    <div className="flex items-center mt-1 text-xs text-gray-500">
                      <Badge variant="outline" className="text-xs font-normal h-5">
                        {getRedirectMethodBadge(campaign.redirectMethod)}
                      </Badge>
                      {campaign.customPath && (
                        <span className="ml-2 truncate max-w-[100px]">
                          /{campaign.customPath}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      
      {/* Campaign Form Modal */}
      <CampaignForm
        open={showNewCampaignModal}
        onOpenChange={setShowNewCampaignModal}
        onSuccess={(campaign) => {
          queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
          handleNavigateToCampaign(campaign.id);
        }}
      />
    </div>
  );
}