import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, DollarSign, Loader2 } from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SpendingData {
  campaigns: Array<{
    id: number;
    daily: number;
    maxDaily: number;
  }>;
  date: string;
}

export default function CampaignSpendingStats() {
  const [totalSpend, setTotalSpend] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);
  
  // Fetch all campaigns' spending data
  const { 
    data: spendingData, 
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<SpendingData>({
    queryKey: ['/api/trafficstar/daily-spending'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });
  
  // Calculate totals when data changes
  useEffect(() => {
    if (spendingData?.campaigns) {
      const dailyTotal = spendingData.campaigns.reduce((sum, campaign) => sum + campaign.daily, 0);
      const budgetTotal = spendingData.campaigns.reduce((sum, campaign) => sum + campaign.maxDaily, 0);
      
      setTotalSpend(dailyTotal);
      setTotalBudget(budgetTotal);
    }
  }, [spendingData]);
  
  // Format to 2 decimal places
  const formatCurrency = (value: number) => {
    return value.toFixed(2);
  };
  
  // Sort campaigns by ID for consistent display
  const sortedCampaigns = spendingData?.campaigns 
    ? [...spendingData.campaigns].sort((a, b) => a.id - b.id)
    : [];
  
  // Sort campaigns by spending percentage (highest first)
  const topCampaigns = spendingData?.campaigns 
    ? [...spendingData.campaigns]
        .filter(c => c.maxDaily > 0) // Only consider campaigns with a budget
        .sort((a, b) => (b.daily / b.maxDaily) - (a.daily / a.maxDaily))
        .slice(0, 5) // Top 5
    : [];
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Campaign Spending Overview
            </CardTitle>
            <CardDescription>
              Daily spending for all TrafficStar campaigns - {spendingData?.date || 'Today'}
            </CardDescription>
          </div>
          
          <button 
            onClick={() => refetch()}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Loading spending data...</span>
            </div>
          </div>
        ) : isError ? (
          <div className="flex justify-center items-center h-40">
            <div className="text-center">
              <p className="text-red-500 mb-2">Failed to load spending data</p>
              <p className="text-sm text-gray-500">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <button 
                onClick={() => refetch()}
                className="mt-4 text-sm text-blue-500 hover:text-blue-700"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-500">Total Campaigns</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">
                  {spendingData?.campaigns.length || 0}
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-500">Daily Spending</div>
                <div className="text-2xl font-bold text-green-700 mt-1 flex items-center">
                  <DollarSign className="h-5 w-5" />
                  {formatCurrency(totalSpend)}
                </div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-500">Total Budget</div>
                <div className="text-2xl font-bold text-purple-700 mt-1 flex items-center">
                  <DollarSign className="h-5 w-5" />
                  {formatCurrency(totalBudget)}
                </div>
              </div>
            </div>
            
            {/* Overall progress */}
            {totalBudget > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <div className="font-medium">Overall Budget Utilization</div>
                  <div className="text-gray-500">
                    ${formatCurrency(totalSpend)} / ${formatCurrency(totalBudget)}
                    <span className="ml-2 text-blue-600 font-medium">
                      {((totalSpend / totalBudget) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${Math.min((totalSpend / totalBudget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            
            {/* Top spending campaigns */}
            {topCampaigns.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3">Top Spending Campaigns</h3>
                <div className="space-y-3">
                  {topCampaigns.map(campaign => {
                    const percentage = campaign.maxDaily > 0 
                      ? (campaign.daily / campaign.maxDaily) * 100 
                      : 0;
                    
                    return (
                      <TooltipProvider key={campaign.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-sm">
                                <div className="font-medium flex items-center gap-2">
                                  Campaign #{campaign.id}
                                  {percentage > 90 && (
                                    <Badge className="bg-red-100 text-red-800 border-red-200">
                                      {percentage.toFixed(0)}%
                                    </Badge>  
                                  )}
                                </div>
                                <div className="text-gray-500">
                                  ${formatCurrency(campaign.daily)} / ${formatCurrency(campaign.maxDaily)}
                                </div>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    percentage > 90 ? 'bg-red-500' : 
                                    percentage > 70 ? 'bg-amber-500' : 
                                    'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Campaign #{campaign.id}: {percentage.toFixed(1)}% of budget used</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* All campaigns table */}
            {sortedCampaigns.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-3">All Campaign Spending</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Campaign ID
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Daily Spend
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Budget
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Usage
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {sortedCampaigns.map(campaign => {
                        const percentage = campaign.maxDaily > 0 
                          ? (campaign.daily / campaign.maxDaily) * 100 
                          : 0;
                          
                        return (
                          <tr key={campaign.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm">{campaign.id}</td>
                            <td className="px-4 py-2 text-sm">${formatCurrency(campaign.daily)}</td>
                            <td className="px-4 py-2 text-sm">${formatCurrency(campaign.maxDaily)}</td>
                            <td className="px-4 py-2 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                  <div 
                                    className={`h-1.5 rounded-full ${
                                      percentage > 90 ? 'bg-red-500' : 
                                      percentage > 70 ? 'bg-amber-500' : 
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs ${
                                  percentage > 90 ? 'text-red-600' : 
                                  percentage > 70 ? 'text-amber-600' : 
                                  'text-green-600'
                                }`}>
                                  {percentage.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}