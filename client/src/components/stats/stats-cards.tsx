import { Card, CardContent } from "@/components/ui/card";
import { FormattedCampaign } from "@/lib/types";

interface StatsCardsProps {
  campaign: FormattedCampaign;
}

export default function StatsCards({ campaign }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Total URLs</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl font-semibold text-gray-900">{campaign.urls.length}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Active URLs</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl font-semibold text-gray-900">{campaign.activeUrlCount}</span>
            <span className="ml-2 text-sm text-gray-500">of {campaign.urls.length}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Total Clicks</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl font-semibold text-gray-900">{campaign.totalClicks}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm font-medium text-gray-500">Remaining Clicks</div>
          <div className="mt-1 flex items-baseline">
            <span className="text-2xl font-semibold text-gray-900">{campaign.remainingClicks}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
