import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";

/**
 * Test controls component for manually triggering various auto-management scenarios
 * This component allows us to easily test:
 * 1. Date change behavior
 * 2. Click threshold (15,000/5,000) behavior
 * 3. Spent value ($10) behavior 
 * 4. 10-minute recheck after spent value pause
 */
export function TrafficStarTestControls() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState({
    dateChange: false,
    clickThreshold: false,
    spentValue: false
  });
  const [results, setResults] = React.useState({
    dateChange: '',
    clickThreshold: '',
    spentValue: ''
  });

  /**
   * Trigger a test endpoint and handle the response
   */
  async function triggerTest(testType: 'dateChange' | 'clickThreshold' | 'spentValue') {
    try {
      setLoading(prev => ({ ...prev, [testType]: true }));
      
      // Map test type to endpoint
      const endpoints = {
        dateChange: '/api/system/test-date-change',
        clickThreshold: '/api/system/test-click-threshold',
        spentValue: '/api/system/test-spent-value'
      };
      
      // Call the appropriate endpoint
      const response = await apiRequest(endpoints[testType], { method: 'POST' });
      
      // Show success message
      toast({
        title: "Test triggered successfully",
        description: response.message,
      });
      
      // Update result message
      setResults(prev => ({ 
        ...prev, 
        [testType]: `✅ Test completed at ${new Date().toLocaleTimeString()}. Check server logs for details.` 
      }));
    } catch (error) {
      console.error(`Error triggering ${testType} test:`, error);
      toast({
        title: "Error triggering test",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive"
      });
      
      // Update result message
      setResults(prev => ({ 
        ...prev, 
        [testType]: `❌ Test failed at ${new Date().toLocaleTimeString()}: ${error instanceof Error ? error.message : String(error)}` 
      }));
    } finally {
      setLoading(prev => ({ ...prev, [testType]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🧪 TrafficStar Integration Tests</CardTitle>
          <CardDescription>
            Manually trigger tests to verify TrafficStar integration functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Test 1: Date Change */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Test 1: Date Change</CardTitle>
                <CardDescription className="text-xs">
                  Simulates a UTC date change to verify campaigns are paused and budget is updated
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2">
                <Button
                  onClick={() => triggerTest('dateChange')}
                  disabled={loading.dateChange}
                  className="w-full"
                >
                  {loading.dateChange ? 'Running Test...' : 'Test Date Change'}
                </Button>
              </CardContent>
              {results.dateChange && (
                <CardFooter className="pt-2 text-xs">
                  <p>{results.dateChange}</p>
                </CardFooter>
              )}
            </Card>
            
            {/* Test 2: Click Threshold */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Test 2: Click Threshold</CardTitle>
                <CardDescription className="text-xs">
                  Tests the 15,000/5,000 click threshold logic for auto-activation/pausing
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2">
                <Button
                  onClick={() => triggerTest('clickThreshold')}
                  disabled={loading.clickThreshold}
                  className="w-full"
                >
                  {loading.clickThreshold ? 'Running Test...' : 'Test Click Threshold'}
                </Button>
              </CardContent>
              {results.clickThreshold && (
                <CardFooter className="pt-2 text-xs">
                  <p>{results.clickThreshold}</p>
                </CardFooter>
              )}
            </Card>
            
            {/* Test 3: Spent Value */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Test 3: Spent Value</CardTitle>
                <CardDescription className="text-xs">
                  Tests the $10 daily spent threshold and 10-minute recheck mechanism
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2">
                <Button
                  onClick={() => triggerTest('spentValue')}
                  disabled={loading.spentValue}
                  className="w-full"
                >
                  {loading.spentValue ? 'Running Test...' : 'Test Spent Value'}
                </Button>
              </CardContent>
              {results.spentValue && (
                <CardFooter className="pt-2 text-xs">
                  <p>{results.spentValue}</p>
                </CardFooter>
              )}
            </Card>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-xs text-muted-foreground">
            These tests simulate conditions to verify TrafficStar integration functionality.
            Check the server logs for detailed test results and API responses.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}