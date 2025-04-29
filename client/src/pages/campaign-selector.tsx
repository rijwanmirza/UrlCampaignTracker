import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, BarChart3, ArrowRight } from 'lucide-react';

export default function CampaignSelectorPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch all campaigns
  const { data: campaignsResponse, isLoading, error } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      return response.json();
    },
  });
  
  // Ensure campaigns is always an array
  const campaigns = Array.isArray(campaignsResponse) ? campaignsResponse : [];
  
  // Filter campaigns based on search term
  const filteredCampaigns = campaigns.filter((campaign) => 
    (campaign.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Campaign Analytics</h1>
        <Link href="/analytics">
          <Button variant="outline">
            Back to Analytics Dashboard
          </Button>
        </Link>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Campaign</CardTitle>
          <CardDescription>
            Choose a campaign to view detailed analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-10">
              Failed to load campaigns. Please try again.
            </div>
          ) : filteredCampaigns?.length ? (
            <div className="space-y-4">
              {filteredCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between border-b pb-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-lg">{campaign.name}</span>
                    <span className="text-sm text-muted-foreground">Campaign ID: {campaign.id}</span>
                  </div>
                  <Link href={`/analytics/campaign/${campaign.id}`}>
                    <Button>
                      View Analytics <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-10">
              <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Campaigns Found</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? `No campaigns matching "${searchTerm}"`
                  : 'No campaigns available'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}