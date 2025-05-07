import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type UrlBudgetLog = {
  id: number;
  urlId: number;
  price: string;
  timestamp: string;
  campaignId: number;
};

export default function UrlBudgetPage() {
  const [logs, setLogs] = useState<UrlBudgetLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('current');
  const { toast } = useToast();

  // Load logs on component mount
  useEffect(() => {
    loadLogs();
  }, [activeTab]);

  // Function to load logs
  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/url-budget-logs', {
        method: 'GET',
      });
      
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load URL budget logs',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading URL budget logs:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to clear logs
  const clearLogs = async () => {
    try {
      const response = await apiRequest('/api/url-budget-logs/clear', {
        method: 'POST',
      });
      
      if (response.ok) {
        setLogs([]);
        toast({
          title: 'Success',
          description: 'URL budget logs cleared successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to clear URL budget logs',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error clearing URL budget logs:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    }
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>URL Budget Logs</CardTitle>
            <Button 
              variant="destructive" 
              onClick={clearLogs}
              disabled={loading || logs.length === 0}
            >
              Clear Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="current" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="current">Current Logs</TabsTrigger>
              <TabsTrigger value="history">Log History</TabsTrigger>
            </TabsList>
            
            <TabsContent value="current">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  These logs show URL budget calculations for campaigns that exceed $10 in spent value.
                  Each entry represents a URL that was included in the budget calculation.
                </p>
              </div>
              
              <Separator className="my-4" />
              
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <p>Loading logs...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="flex justify-center items-center h-40">
                  <p>No URL budget logs found. Logs will appear when campaigns exceed $10 in spent value.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL ID</TableHead>
                      <TableHead>Campaign ID</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{log.urlId}</TableCell>
                        <TableCell>{log.campaignId}</TableCell>
                        <TableCell>${parseFloat(log.price).toFixed(4)}</TableCell>
                        <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            
            <TabsContent value="history">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  This tab shows the history of URL budget calculations, including URLs added after the initial calculation.
                </p>
              </div>
              
              <Separator className="my-4" />
              
              <div className="flex justify-center items-center h-40">
                <p>Historical data will be available in a future update.</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}