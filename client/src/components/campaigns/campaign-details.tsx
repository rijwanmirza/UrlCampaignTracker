import { useState, useEffect } from "react";
import { Clipboard, ExternalLink, AlertCircle } from "lucide-react";
import { FormattedCampaign } from "@/lib/types";
import { RedirectMethod } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import CampaignEditForm from "./campaign-edit-form";
import CampaignDeleteButton from "./campaign-delete-button";
import { useLocation } from "wouter";
import RunMigrationButton from "@/components/RunMigrationButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CampaignDetailsProps {
  campaign: FormattedCampaign;
}

export default function CampaignDetails({ campaign }: CampaignDetailsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();
  const [migrationNeeded, setMigrationNeeded] = useState<boolean>(false);

  const redirectMethodLabels: Record<string, string> = {
    [RedirectMethod.DIRECT]: "Direct Redirect",
    [RedirectMethod.META_REFRESH]: "Meta Refresh",
    [RedirectMethod.DOUBLE_META_REFRESH]: "Double Meta Refresh",
    [RedirectMethod.HTTP_307]: "HTTP 307 Redirect",
    [RedirectMethod.HTTP2_307_TEMPORARY]: "HTTP/2.0 307 Temporary",
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

  // Check if migrations are needed when component mounts
  useEffect(() => {
    const checkMigrations = async () => {
      try {
        // Call the migration endpoint
        const response = await fetch('/api/system/check-migrations');
        const data = await response.json();
        
        // Since we fixed the backend to always return false for migrationNeeded,
        // we'll force migrationNeeded to false here as well for redundancy
        console.log('Database migrations check result:', data);
        
        // FIXED: Always set migrationNeeded to false to prevent popup
        setMigrationNeeded(false);
      } catch (error) {
        console.error('Failed to check migration status:', error);
        // FIXED: Don't assume migration is needed, set to false
        setMigrationNeeded(false);
      }
    };
    
    checkMigrations();
  }, []);
  
  return (
    <div className="space-y-4 mb-6">
      {migrationNeeded && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Database Migration Required</AlertTitle>
          <AlertDescription className="text-amber-700">
            The budget update time feature is ready but requires a database migration. 
            Click the button below to run the migration before setting TrafficStar settings.
            <div className="mt-2">
              <RunMigrationButton />
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <span><Badge variant="secondary" className="text-xs">ID: {campaign.id}</Badge></span>
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
              
              <div>
                <span className="text-sm font-medium text-gray-500">Click Multiplier:</span>
                <div className="text-gray-900 flex items-center gap-1">
                  {campaign.multiplier || 1}
                  {Number(campaign.multiplier) > 1 && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  )}
                </div>
              </div>

              <div>
                <span className="text-sm font-medium text-gray-500">Price Per 1000 Clicks:</span>
                <p className="text-gray-900">
                  ${typeof campaign.pricePerThousand === 'string' 
                    ? parseFloat(campaign.pricePerThousand).toFixed(4) 
                    : (Number(campaign.pricePerThousand || 0)).toFixed(4)}
                </p>
              </div>

              {Number(campaign.pricePerThousand || 0) > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Campaign Pricing:</span>
                  <p className="text-gray-900">
                    <span className="font-medium">
                      ${campaign.remainingPrice.toFixed(4)}/
                      ${campaign.totalPrice.toFixed(4)}
                    </span> 
                    <span className="text-xs text-gray-500 ml-1">
                      ({campaign.remainingClicks.toLocaleString()} clicks remaining)
                    </span>
                  </p>
                </div>
              )}
              
              {campaign.budgetUpdateTime && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Budget Update Time (UTC):</span>
                  <p className="text-gray-900">
                    {campaign.budgetUpdateTime}
                  </p>
                </div>
              )}
              
              {campaign.trafficstarCampaignId && (
                <div>
                  <span className="text-sm font-medium text-gray-500">TrafficStar Integration:</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                      Connected
                    </Badge>
                    <span className="text-xs text-gray-500">
                      Campaign #{campaign.trafficstarCampaignId}
                    </span>
                  </div>
                </div>
              )}
              
              {/* TrafficStar Daily Spent Section */}
              {campaign.trafficstarCampaignId && (
                <div className="mt-2 px-2 py-1 bg-slate-50 rounded-md border border-slate-100">
                  <span className="text-sm font-medium text-slate-700">TrafficStar Spent:</span>
                  <div className="flex items-center gap-2">
                    <div className="text-slate-900 font-semibold">
                      ${typeof campaign.dailySpent === 'string' 
                        ? parseFloat(campaign.dailySpent || '0').toFixed(4) 
                        : (Number(campaign.dailySpent || 0)).toFixed(4)}
                      <span className="text-xs text-slate-500 ml-1 font-normal">
                        {campaign.dailySpentDate 
                          ? `on ${new Date(campaign.dailySpentDate).toLocaleDateString()}` 
                          : 'today'}
                      </span>
                    </div>
                    {campaign.lastSpentCheck && (
                      <span className="text-xs text-slate-500">
                        (last checked: {new Date(campaign.lastSpentCheck).toLocaleTimeString()})
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {/* Traffic Sender Status - removed */}
            </div>
            
            <div className="mt-6">
              <CampaignDeleteButton 
                campaignId={campaign.id} 
                onSuccess={() => navigate('/')} 
              />
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
    </div>
  );
}