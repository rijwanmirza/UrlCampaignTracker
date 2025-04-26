import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import axios from 'axios';

export function TestUrlBudget() {
  const { toast } = useToast();
  const [campaignId, setCampaignId] = useState('27');
  const [urlId, setUrlId] = useState('');
  const [immediate, setImmediate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [clickLimit, setClickLimit] = useState('10000');
  const [name, setName] = useState('Test URL');
  const [targetUrl, setTargetUrl] = useState('https://example.com');
  const [status, setStatus] = useState('active');
  const [result, setResult] = useState<any>(null);

  // Create a new URL
  const createUrl = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(
        `/api/campaigns/${campaignId}/urls`,
        {
          name,
          targetUrl,
          clickLimit,
          status
        }
      );
      
      setResult(response.data);
      setUrlId(response.data.id.toString());
      
      toast({
        title: 'URL Created',
        description: `Created URL ID: ${response.data.id} with ${response.data.clickLimit} clicks`,
      });
    } catch (error: any) {
      console.error('Error creating URL:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create URL',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test URL budget
  const testUrlBudget = async () => {
    if (!urlId) {
      toast({
        title: 'Error',
        description: 'URL ID is required',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`/api/system/test-url-budget-update`, {
        campaignId: parseInt(campaignId),
        urlId: parseInt(urlId),
        immediate
      });
      
      setResult(response.data);
      
      toast({
        title: 'URL Budget Test',
        description: response.data.message || 'Budget update process initiated',
      });
    } catch (error: any) {
      console.error('Error testing URL budget:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to test URL budget',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get campaign info
  const getCampaignInfo = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/campaigns/${campaignId}`);
      const trafficstarId = response.data.trafficstarCampaignId;
      
      if (!trafficstarId) {
        toast({
          title: 'Error',
          description: 'Campaign has no TrafficStar ID',
          variant: 'destructive',
        });
        return;
      }
      
      const tsResponse = await axios.get(`/api/trafficstar/campaigns/${trafficstarId}`);
      setResult(tsResponse.data);
      
      toast({
        title: 'Campaign Info',
        description: `Campaign daily budget: $${tsResponse.data.max_daily}`,
      });
    } catch (error: any) {
      console.error('Error getting campaign info:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to get campaign info',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>URL Budget Testing</CardTitle>
        <CardDescription>
          Test the 10-minute delay mechanism for URL budget handling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="grid gap-3">
            <Label htmlFor="campaignId">Campaign ID</Label>
            <Input
              id="campaignId"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              placeholder="Enter campaign ID"
            />
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Create New URL</h3>
            
            <div className="grid gap-3">
              <Label htmlFor="name">URL Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter URL name"
              />
            </div>
            
            <div className="grid gap-3">
              <Label htmlFor="targetUrl">Target URL</Label>
              <Input
                id="targetUrl"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="Enter target URL"
              />
            </div>
            
            <div className="grid gap-3">
              <Label htmlFor="clickLimit">Click Limit</Label>
              <Input
                id="clickLimit"
                value={clickLimit}
                onChange={(e) => setClickLimit(e.target.value)}
                placeholder="Enter click limit"
              />
            </div>
            
            <div className="grid gap-3">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button onClick={createUrl} disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create URL'}
            </Button>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Test URL Budget</h3>
            
            <div className="grid gap-3">
              <Label htmlFor="urlId">URL ID</Label>
              <Input
                id="urlId"
                value={urlId}
                onChange={(e) => setUrlId(e.target.value)}
                placeholder="Enter URL ID"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="immediate"
                checked={immediate}
                onCheckedChange={(checked: boolean) => setImmediate(checked)}
              />
              <Label htmlFor="immediate">Process Immediately (Skip 10-minute delay)</Label>
            </div>
            
            <Button onClick={testUrlBudget} disabled={isLoading}>
              {isLoading ? 'Testing...' : 'Test URL Budget'}
            </Button>
          </div>
          
          <Separator />
          
          <Button onClick={getCampaignInfo} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Get Campaign Info'}
          </Button>
        </div>
        
        {result && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Result:</h3>
            <pre className="p-4 bg-slate-100 rounded-md overflow-auto max-h-72">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <div className="text-sm text-slate-500">
          <p>
            <strong>How URL Budget Handling Works:</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>When a new URL is added to a campaign, its budget is tracked for a 10-minute delay</li>
            <li>If multiple URLs are added during this period, their budgets are combined</li>
            <li>After the delay, the combined budget is applied to the TrafficStar campaign</li>
            <li>This prevents too many small budget updates and allows for batch processing</li>
          </ul>
        </div>
      </CardFooter>
    </Card>
  );
}

// Default export for compatibility
export default TestUrlBudget;