import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Link2, ArrowRight } from 'lucide-react';

export default function UrlSelectorPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch all URLs
  const { data: urlsResponse, isLoading, error } = useQuery({
    queryKey: ['/api/urls'],
    queryFn: async () => {
      const response = await fetch('/api/urls');
      if (!response.ok) {
        throw new Error('Failed to fetch URLs');
      }
      return response.json();
    },
  });
  
  // Ensure urls is always an array
  const urls = Array.isArray(urlsResponse) ? urlsResponse : [];
  
  // Filter URLs based on search term
  const filteredUrls = urls.filter((url) => 
    (url.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (url.targetUrl || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">URL Analytics</h1>
        <Link href="/analytics">
          <Button variant="outline">
            Back to Analytics Dashboard
          </Button>
        </Link>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select URL</CardTitle>
          <CardDescription>
            Choose a URL to view detailed analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by URL name or target..."
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
              Failed to load URLs. Please try again.
            </div>
          ) : filteredUrls?.length ? (
            <div className="space-y-4">
              {filteredUrls.map((url) => (
                <div key={url.id} className="flex items-center justify-between border-b pb-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-lg">{url.name}</span>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Link2 className="h-3 w-3 mr-1" />
                      <span className="truncate max-w-[300px]">{url.targetUrl}</span>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">Campaign: {url.campaignName || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold">{url.totalClicks || 0} clicks</div>
                      <div className="text-xs text-muted-foreground">ID: {url.id}</div>
                    </div>
                    <Link href={`/analytics/url/${url.id}`}>
                      <Button>
                        View Analytics <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-10">
              <Link2 className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No URLs Found</h3>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? `No URLs matching "${searchTerm}"`
                  : 'No URLs available'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}