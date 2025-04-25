import { FormattedCampaign } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart,
  ClipboardCheck, 
  MousePointer, 
  Clock, 
  Link
} from "lucide-react";

interface StatsCardsProps {
  campaign: FormattedCampaign;
}

export default function StatsCards({ campaign }: StatsCardsProps) {
  // Only consider active URLs for all calculations
  const activeUrls = campaign.urls.filter(url => url.isActive);
  
  // Calculate percentage of clicks used
  const totalClicksPercent = Math.min(
    100, 
    campaign.totalClicks > 0 && campaign.remainingClicks > 0 
      ? (campaign.totalClicks / (campaign.totalClicks + campaign.remainingClicks)) * 100 
      : 0
  );
  
  // Calculate clicks per URL (only for active URLs)
  const clicksPerUrl = campaign.activeUrlCount > 0 
    ? (campaign.totalClicks / campaign.activeUrlCount).toFixed(1) 
    : "0";
  
  // Active URL percentage
  const activeUrlPercent = campaign.urls.length > 0
    ? Math.round((campaign.activeUrlCount / campaign.urls.length) * 100)
    : 0;
  
  // Count of completed URLs (URLs that have reached their click limit)
  const completedUrlCount = campaign.urls.filter(url => url.status === 'completed').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
          <MousePointer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{campaign.totalClicks}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {campaign.remainingClicks.toLocaleString()} remaining clicks available
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${totalClicksPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active URLs</CardTitle>
          <Link className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {campaign.activeUrlCount}/{campaign.urls.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {activeUrlPercent}% URLs still active
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${activeUrlPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Clicks per URL</CardTitle>
          <BarChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{clicksPerUrl}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Average clicks per URL
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {completedUrlCount}/{campaign.urls.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            URLs that reached click limit
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${campaign.urls.length > 0 ? (completedUrlCount / campaign.urls.length) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}