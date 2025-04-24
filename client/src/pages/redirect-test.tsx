import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function RedirectTest() {
  const [campaignId, setCampaignId] = useState("");
  const [redirectMethod, setRedirectMethod] = useState("http2_forced_307");
  
  // Create a test URL in the specified campaign with the selected redirect method
  const createTestUrl = async () => {
    if (!campaignId) return;
    
    try {
      // First check if the campaign exists
      const response = await fetch(`/api/campaigns/${campaignId}`);
      
      if (!response.ok) {
        alert(`Campaign ${campaignId} not found. Please create it first.`);
        return;
      }
      
      const campaign = await response.json();
      
      // Update campaign to use the selected redirect method
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...campaign,
          redirectMethod
        })
      });
      
      // Create a test URL in the campaign
      const testUrlResponse = await fetch(`/api/campaigns/${campaignId}/urls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `Test URL ${Date.now()}`,
          targetUrl: "https://www.google.com",
          clickLimit: 1000,
          status: "active"
        })
      });
      
      if (testUrlResponse.ok) {
        const url = await testUrlResponse.json();
        
        // Open test URL in a new tab
        window.open(`/r/${campaignId}/${url.id}`, '_blank');
      }
    } catch (error) {
      console.error("Error creating test URL", error);
      alert("Failed to create test URL. See console for details.");
    }
  };
  
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">HTTP/2.0 Redirect Performance Tester</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test HTTP/2.0 Redirect Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="campaignId">Campaign ID</Label>
              <Input 
                id="campaignId"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="Enter campaign ID" 
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="redirectMethod">Redirect Method</Label>
              <Select 
                value={redirectMethod} 
                onValueChange={setRedirectMethod}
              >
                <SelectTrigger id="redirectMethod">
                  <SelectValue placeholder="Select redirect method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http2_forced_307">HTTP/2.0 Forced 307 (Cloudflare Format)</SelectItem>
                  <SelectItem value="http2_307_temporary">HTTP/2.0 307 Temporary</SelectItem>
                  <SelectItem value="http_307">HTTP 307 Temporary</SelectItem>
                  <SelectItem value="meta_refresh">Meta Refresh</SelectItem>
                  <SelectItem value="double_meta_refresh">Double Meta Refresh</SelectItem>
                  <SelectItem value="direct">Standard 302 Redirect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button onClick={createTestUrl}>Create Test URL & Open Redirect</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Performance Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>HTTP/2.0 Forced 307</strong>: Optimized for zero-delay redirects using Cloudflare-style headers.</li>
            <li><strong>HTTP/2.0 307 Temporary</strong>: Minimalist implementation with zero processing overhead.</li>
            <li><strong>HTTP 307 Temporary</strong>: Standard HTTP 307 redirect.</li>
            <li><strong>Meta Refresh</strong>: HTML-based instant redirect using meta tags.</li>
            <li><strong>Double Meta Refresh</strong>: Two-step meta redirect for compatibility.</li>
            <li><strong>Standard 302</strong>: Traditional 302 Found redirect.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}