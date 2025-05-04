import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { apiRequest } from "@/lib/queryClient"

/**
 * TrafficStar Reports API Tester
 * Tests the campaign spent value reports API with proper date formatting
 */
export function ReportsApiTester() {
  const [campaignId, setCampaignId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testReportsApi = async () => {
    if (!campaignId) {
      setError('Campaign ID is required')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      
      console.log(`Testing reports API for campaign ID: ${campaignId}`)
      
      // Use fetch directly to have more control over the request
      const response = await fetch('/api/test-reports-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ campaignId: parseInt(campaignId) })
      })
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`)
      }
      
      const data = await response.json()
      setResult(data)
      console.log('Reports API test result:', data)
    } catch (err: any) {
      console.error('Error testing reports API:', err)
      setError(err?.message || 'An error occurred during the API test')
      setResult(null)
    } finally {
      setIsLoading(false)
    }
  }

  const formatJSON = (data: any) => {
    return JSON.stringify(data, null, 2)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>TrafficStar Reports API Tester</CardTitle>
        <CardDescription>
          Test the spent value reports API with proper date formatting
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid w-full items-center gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="campaign-id">Campaign ID</Label>
            <Input 
              id="campaign-id" 
              placeholder="Enter TrafficStar campaign ID" 
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            />
          </div>
          <Button 
            onClick={testReportsApi} 
            disabled={isLoading || !campaignId}
          >
            {isLoading ? 'Testing...' : 'Test Reports API'}
          </Button>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              {error}
            </div>
          )}
          
          {result && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Results:</h3>
              <div className="p-3 bg-green-50 border border-green-200 rounded-md mb-3">
                <strong>Date:</strong> {result.date}<br />
                <strong>Extracted Spent Value:</strong> ${result.extractedSpent?.toFixed(4) || '0.0000'}
              </div>
              <div className="bg-slate-50 p-3 rounded-md overflow-auto max-h-60">
                <pre className="text-xs">{formatJSON(result.rawResponse)}</pre>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}