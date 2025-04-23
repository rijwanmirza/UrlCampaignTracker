import { useState } from "react";
import { Clipboard, ExternalLink } from "lucide-react";
import { FormattedCampaign } from "@/lib/types";
import { RedirectMethod } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import CampaignEditForm from "./campaign-edit-form";

interface CampaignDetailsProps {
  campaign: FormattedCampaign;
}

export default function CampaignDetails({ campaign }: CampaignDetailsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const redirectMethodLabels: Record<string, string> = {
    [RedirectMethod.DIRECT]: "Direct Redirect",
    [RedirectMethod.META_REFRESH]: "Meta Refresh",
    [RedirectMethod.DOUBLE_META_REFRESH]: "Double Meta Refresh",
    [RedirectMethod.HTTP_307]: "HTTP 307 Redirect",
  };

  // Generate campaign URLs
  const campaignRotationUrl = `${window.location.origin}/c/${campaign.id}`;
  const customPathUrl = campaign.customPath 
    ? `${window.location.origin}/views/${campaign.customPath}`
    : null;

  // Handle copy to clipboard
  const handleCopyUrl = (url: string, label: string) => {
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        toast({
          title: "URL Copied",
          description: `${label} URL has been copied to clipboard`,
        });
        
        setTimeout(() => setCopied(false), 2000);
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Campaign Details
              <Badge variant="outline" className="text-xs ml-2">
                {redirectMethodLabels[campaign.redirectMethod] || campaign.redirectMethod}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>Created on {formatDate(campaign.createdAt)}</span>
              <Badge variant="secondary" className="text-xs">ID: {campaign.id}</Badge>
            </CardDescription>
          </div>
          
          <CampaignEditForm campaign={campaign} />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-500">Campaign Name:</span>
              <p className="text-gray-900">{campaign.name}</p>
            </div>
            
            <div>
              <span className="text-sm font-medium text-gray-500">URLs in Campaign:</span>
              <p className="text-gray-900">{campaign.urls.length}</p>
            </div>
            
            <div>
              <span className="text-sm font-medium text-gray-500">Active URLs:</span>
              <p className="text-gray-900">{campaign.activeUrlCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Campaign URLs</CardTitle>
          <CardDescription>Share these URLs with your audience</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-500">Rotation URL:</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 gap-1 text-gray-500 hover:text-gray-900"
                  onClick={() => handleCopyUrl(campaignRotationUrl, "Rotation")}
                >
                  <Clipboard className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <div className="flex items-center">
                <div className="bg-gray-50 px-3 py-2 text-gray-700 border rounded-l text-sm truncate flex-1">
                  {campaignRotationUrl}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 rounded-l-none border border-l-0"
                  onClick={() => window.open(campaignRotationUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {customPathUrl && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-500">Custom Path URL:</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 gap-1 text-gray-500 hover:text-gray-900"
                    onClick={() => handleCopyUrl(customPathUrl, "Custom Path")}
                  >
                    <Clipboard className="h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <div className="flex items-center">
                  <div className="bg-gray-50 px-3 py-2 text-gray-700 border rounded-l text-sm truncate flex-1">
                    {customPathUrl}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 rounded-l-none border border-l-0"
                    onClick={() => window.open(customPathUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}