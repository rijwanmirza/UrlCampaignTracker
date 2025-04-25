import { FormattedCampaign } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MousePointer } from "lucide-react";

interface StatsCardsProps {
  campaign: FormattedCampaign;
}

export default function StatsCards({ campaign }: StatsCardsProps) {
  // Calculate percentage of clicks used
  const totalClicksPercent = Math.min(
    100, 
    campaign.totalClicks > 0 && campaign.remainingClicks > 0 
      ? (campaign.totalClicks / (campaign.totalClicks + campaign.remainingClicks)) * 100 
      : 0
  );

  return (
    <div className="mb-6">
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
    </div>
  );
}