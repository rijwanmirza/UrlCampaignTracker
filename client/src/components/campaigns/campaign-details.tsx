import { useState, useEffect } from "react";
import { Clipboard, ExternalLink, AlertCircle, LineChart, Loader2, DollarSign, RefreshCw } from "lucide-react";
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
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CampaignDetailsProps {
  campaign: FormattedCampaign;
}

// Define the spent value stats type for TrafficStar API integration
interface SpentValueStats {
  campaignId: number;
  dateRange: {
    from: string;
    to: string;
  };
  dailyStats: Array<{
    date: string;
    impressions: number;
    clicks: number;
    leads: number;
    price: number;
    ecpm: number;
    ecpc: number;
    ecpa: number;
    ctr: number;
  }>;
  totals: {
    spent: number;
    impressions: number;
    clicks: number;
    leads: number;
    ecpm: number;
    ecpc: number;
    ecpa: number;
    ctr: number;
  };
}

export default function CampaignDetails({ campaign }: CampaignDetailsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();
  const [migrationNeeded, setMigrationNeeded] = useState<boolean>(false);
  const [spentValueData, setSpentValueData] = useState<SpentValueStats | null>(null);
  const [isLoadingSpentValue, setIsLoadingSpentValue] = useState(false);
  const [spentValueError, setSpentValueError] = useState<string | null>(null);

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

  // Function to fetch campaign spent values from the TrafficStar API
  const fetchCampaignSpentValues = async (campaignId: number | string) => {
    if (!campaignId) return;
    
    setIsLoadingSpentValue(true);
    setSpentValueError(null);
    
    try {
      // Get current UTC date
      const now = new Date();
      // Default dates: 7 days ago to today (UTC)
      const today = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Calculate 7 days ago in UTC
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      const fromDate = sevenDaysAgo.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Create query parameters
      const params = new URLSearchParams();
      params.append('dateFrom', fromDate);
      params.append('dateUntil', today);
      
      // Fetch spent value data
      const response = await fetch(`/api/trafficstar/campaigns/${campaignId}/spent?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch spent value data');
      }
      
      const spentData: SpentValueStats = await response.json();
      setSpentValueData(spentData);
      
    } catch (error) {
      console.error('Error fetching campaign spent values:', error);
      setSpentValueError(error instanceof Error ? error.message : 'An unknown error occurred');
      
      toast({
        title: 'Failed to Fetch Campaign Costs',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpentValue(false);
    }
  };

  // Check if migrations are needed and fetch campaign spent values when component mounts
  useEffect(() => {
    const checkMigrations = async () => {
      try {
        const response = await fetch('/api/system/check-migrations');
        const data = await response.json();
        
        if (data.migrationNeeded) {
          console.log('Database migrations are needed:', data);
          setMigrationNeeded(true);
        } else {
          console.log('No database migrations needed');
          setMigrationNeeded(false);
        }
      } catch (error) {
        console.error('Failed to check migration status:', error);
        // If check fails, assume migration is needed
        setMigrationNeeded(true);
      }
    };
    
    checkMigrations();
    
    // If campaign has a TrafficStar ID, fetch the spent values automatically
    if (campaign.trafficstarCampaignId) {
      fetchCampaignSpentValues(campaign.trafficstarCampaignId);
    }
  }, [campaign.trafficstarCampaignId]);
  
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
              
              {campaign.trafficstarCampaignId && campaign.autoManageTrafficstar && (
                <div>
                  <span className="text-sm font-medium text-gray-500">TrafficStar Integration:</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                      Auto-Managed
                    </Badge>
                    <span className="text-xs text-gray-500">
                      Campaign #{campaign.trafficstarCampaignId}
                    </span>
                  </div>
                </div>
              )}
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

      {/* Campaign TrafficStar Stats */}
      {campaign.trafficstarCampaignId && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LineChart className="h-5 w-5 text-blue-600" />
                    Campaign Statistics
                  </CardTitle>
                  <CardDescription>
                    TrafficStar campaign costs and performance (last 7 days)
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fetchCampaignSpentValues(campaign.trafficstarCampaignId)}
                  disabled={isLoadingSpentValue}
                >
                  {isLoadingSpentValue ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingSpentValue ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <span>Loading campaign statistics...</span>
                </div>
              ) : spentValueError ? (
                <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700 flex items-start">
                  <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold">Error retrieving data</h4>
                    <p>{spentValueError}</p>
                  </div>
                </div>
              ) : spentValueData ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 border rounded-md">
                      <div className="text-sm text-muted-foreground">Total Spent</div>
                      <div className="text-2xl font-bold text-blue-700 flex items-center">
                        <DollarSign className="h-4 w-4 mr-1" />
                        {spentValueData.totals.spent.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-4 border rounded-md">
                      <div className="text-sm text-muted-foreground">Impressions</div>
                      <div className="text-2xl font-bold">{spentValueData.totals.impressions.toLocaleString()}</div>
                    </div>
                    <div className="p-4 border rounded-md">
                      <div className="text-sm text-muted-foreground">Clicks</div>
                      <div className="text-2xl font-bold">{spentValueData.totals.clicks.toLocaleString()}</div>
                    </div>
                    <div className="p-4 border rounded-md">
                      <div className="text-sm text-muted-foreground">eCPM</div>
                      <div className="text-2xl font-bold">${spentValueData.totals.ecpm.toFixed(4)}</div>
                    </div>
                  </div>
                  
                  <h4 className="font-medium mb-2">Daily Statistics</h4>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Impressions</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                          <TableHead className="text-right">CTR</TableHead>
                          <TableHead className="text-right">Cost (USD)</TableHead>
                          <TableHead className="text-right">eCPM</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {spentValueData.dailyStats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-4">
                              No data available for the selected date range
                            </TableCell>
                          </TableRow>
                        ) : (
                          spentValueData.dailyStats.map((day, index) => (
                            <TableRow key={index}>
                              <TableCell>{day.date ? new Date(day.date).toLocaleDateString() : 'N/A'}</TableCell>
                              <TableCell className="text-right">{day.impressions.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{day.clicks.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{day.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">${parseFloat(day.price.toString()).toFixed(2)}</TableCell>
                              <TableCell className="text-right">${parseFloat(day.ecpm.toString()).toFixed(4)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Date range: {spentValueData.dateRange.from} to {spentValueData.dateRange.to} (UTC)
                  </div>
                </div>
              ) : (
                <div className="flex justify-center items-center py-8 flex-col text-center space-y-2">
                  <LineChart className="h-10 w-10 text-gray-300" />
                  <div>
                    <p className="text-muted-foreground">Campaign statistics not loaded</p>
                    <p className="text-sm text-muted-foreground">Click refresh to load stats for TrafficStar campaign #{campaign.trafficstarCampaignId}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}