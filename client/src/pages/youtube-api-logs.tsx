import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle, Clock, Filter, RotateCcw, Trash2, Youtube } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface YouTubeApiLog {
  id: number;
  logType: string;
  message: string;
  campaignId: number | null;
  campaignName: string | null;
  details: any;
  isError: boolean;
  timestamp: string;
}

export default function YouTubeApiLogsPage() {
  const { toast } = useToast();
  
  // Filter states
  const [logTypeFilter, setLogTypeFilter] = useState<string | null>(null);
  const [campaignIdFilter, setCampaignIdFilter] = useState<number | null>(null);
  const [errorFilter, setErrorFilter] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // State for force check
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  
  // Selected log for detailed view
  const [selectedLog, setSelectedLog] = useState<YouTubeApiLog | null>(null);
  
  // Get YouTube API logs
  const { data, isLoading, isError, refetch } = useQuery<{ logs: YouTubeApiLog[] }>({
    queryKey: ['/api/youtube-api-logs'],
    staleTime: 30000,
  });
  
  // Delete a single log
  const handleDeleteLog = async (logId: number) => {
    try {
      await fetch(`/api/youtube-api-logs/${logId}`, {
        method: 'DELETE',
      });
      
      toast({
        title: 'Log deleted',
        description: 'The log entry has been deleted successfully.',
      });
      
      // Invalidate cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/youtube-api-logs'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete log entry.',
        variant: 'destructive',
      });
    }
  };
  
  // Delete all logs
  const handleDeleteAllLogs = async () => {
    if (window.confirm('Are you sure you want to delete all YouTube API logs? This action cannot be undone.')) {
      try {
        await fetch('/api/youtube-api-logs', {
          method: 'DELETE',
        });
        
        toast({
          title: 'All logs deleted',
          description: 'All YouTube API logs have been deleted successfully.',
        });
        
        // Invalidate cache to refresh data
        queryClient.invalidateQueries({ queryKey: ['/api/youtube-api-logs'] });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete all logs.',
          variant: 'destructive',
        });
      }
    }
  };
  
  // Apply filters to logs
  const filteredLogs = data?.logs.filter(log => {
    // Apply log type filter
    if (logTypeFilter && log.logType !== logTypeFilter) {
      return false;
    }
    
    // Apply campaign ID filter
    if (campaignIdFilter !== null && log.campaignId !== campaignIdFilter) {
      return false;
    }
    
    // Apply error filter
    if (errorFilter !== null && log.isError !== errorFilter) {
      return false;
    }
    
    // Apply search query filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchLower) ||
        (log.campaignName?.toLowerCase().includes(searchLower) || false) ||
        String(log.id).includes(searchQuery) ||
        String(log.campaignId).includes(searchQuery)
      );
    }
    
    return true;
  }) || [];
  
  // Get unique log types for filter dropdown
  const uniqueLogTypes = data?.logs
    ? [...new Set(data.logs.map(log => log.logType))]
    : [];
  
  // Get unique campaign IDs for filter dropdown
  const uniqueCampaignIds = data?.logs
    ? [...new Set(data.logs.filter(log => log.campaignId !== null).map(log => log.campaignId))]
    : [];
  
  // Reset all filters
  const resetFilters = () => {
    setLogTypeFilter(null);
    setCampaignIdFilter(null);
    setErrorFilter(null);
    setSearchQuery('');
  };
  
  // View log details in dialog
  const viewLogDetails = (log: YouTubeApiLog) => {
    setSelectedLog(log);
  };
  
  // Force a YouTube API check for a campaign
  const forceYouTubeCheck = async (campaignId: number) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/check-youtube`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      toast({
        title: 'YouTube check triggered',
        description: data.message || 'YouTube API check has been manually triggered.',
      });
      
      // Wait a bit and then refresh the logs
      setTimeout(() => {
        refetch();
      }, 1000);
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to trigger YouTube API check: ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
    }
  };
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">YouTube API Logs</h1>
          <p className="text-muted-foreground">
            Monitor and track all YouTube API activity and validation checks.
          </p>
        </div>
        
        <div className="flex gap-2 mt-4 md:mt-0">
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="flex items-center gap-1"
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
          
          <Button
            variant="destructive"
            onClick={handleDeleteAllLogs}
            className="flex items-center gap-1"
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>
      
      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Logs
          </CardTitle>
          <CardDescription>
            Use these filters to narrow down the results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            {/* Force check button */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <p className="text-sm text-muted-foreground">Want to see actual YouTube API calls? Select a campaign and force a check.</p>
              <div className="flex gap-2">
                <Select
                  value={selectedCampaignId?.toString() || 'select_campaign'}
                  onValueChange={(value) => setSelectedCampaignId(value === 'select_campaign' ? null : Number(value))}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Force Check Campaign</SelectLabel>
                      <SelectItem value="select_campaign">Select Campaign</SelectItem>
                      {uniqueCampaignIds.map((id) => {
                        if (id === null) return null;
                        return (
                          <SelectItem key={id} value={id.toString()}>
                            Campaign {id}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => {
                    if (selectedCampaignId) {
                      forceYouTubeCheck(selectedCampaignId);
                    } else {
                      toast({
                        title: 'Campaign required',
                        description: 'Please select a campaign first',
                        variant: 'destructive'
                      });
                    }
                  }}
                  className="flex items-center gap-1"
                  disabled={!selectedCampaignId}
                >
                  <Youtube className="h-4 w-4" />
                  Force Check
                </Button>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Select
                  value={logTypeFilter || 'all_types'}
                  onValueChange={(value) => setLogTypeFilter(value === 'all_types' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Log Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Log Type</SelectLabel>
                      <SelectItem value="all_types">All Types</SelectItem>
                      {uniqueLogTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select
                  value={campaignIdFilter?.toString() || 'all_campaigns'}
                  onValueChange={(value) => setCampaignIdFilter(value === 'all_campaigns' ? null : Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Campaign ID" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Campaign ID</SelectLabel>
                      <SelectItem value="all_campaigns">All Campaigns</SelectItem>
                      {uniqueCampaignIds.map((id) => {
                        if (id === null) return null;
                        return (
                          <SelectItem key={id} value={id.toString()}>
                            {id}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select
                  value={errorFilter === null ? 'all_statuses' : errorFilter ? 'true' : 'false'}
                  onValueChange={(value) => {
                    if (value === 'all_statuses') setErrorFilter(null);
                    else setErrorFilter(value === 'true');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Error Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Error Status</SelectLabel>
                      <SelectItem value="all_statuses">All Statuses</SelectItem>
                      <SelectItem value="true">Errors Only</SelectItem>
                      <SelectItem value="false">Success Only</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetFilters}
                  title="Reset filters"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="flex justify-center items-center h-64 text-destructive">
              <AlertTriangle className="h-8 w-8 mr-2" />
              <p>Failed to load YouTube API logs. Please try again.</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64 text-muted-foreground">
              <Youtube className="h-12 w-12 mb-4" />
              <p>No YouTube API logs found matching your filters.</p>
              <Button
                variant="link"
                onClick={resetFilters}
                className="mt-2"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[100px]">Campaign</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[150px]">Timestamp</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono">{log.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.logType}</Badge>
                      </TableCell>
                      <TableCell>
                        {log.campaignId ? (
                          <Badge variant="secondary">{log.campaignId}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">System</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {log.message}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span title={new Date(log.timestamp).toLocaleString()}>
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.isError ? (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : (
                          <Badge variant="success" className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-200">
                            <CheckCircle className="h-3 w-3" />
                            Success
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewLogDetails(log)}
                              >
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>YouTube API Log Details</DialogTitle>
                                <DialogDescription>
                                  Detailed information about this API log entry.
                                </DialogDescription>
                              </DialogHeader>
                              
                              {selectedLog && (
                                <div className="mt-4 space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm font-semibold">Log ID</p>
                                      <p className="text-md">{selectedLog.id}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">Log Type</p>
                                      <p className="text-md">{selectedLog.logType}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">Campaign ID</p>
                                      <p className="text-md">{selectedLog.campaignId || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">Campaign Name</p>
                                      <p className="text-md">{selectedLog.campaignName || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">Status</p>
                                      <p className="text-md">
                                        {selectedLog.isError ? (
                                          <Badge variant="destructive" className="flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Error
                                          </Badge>
                                        ) : (
                                          <Badge variant="success" className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-200">
                                            <CheckCircle className="h-3 w-3" />
                                            Success
                                          </Badge>
                                        )}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold">Timestamp</p>
                                      <p className="text-md">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <p className="text-sm font-semibold">Message</p>
                                    <p className="text-md mt-1">{selectedLog.message}</p>
                                  </div>
                                  
                                  <div>
                                    <p className="text-sm font-semibold">Details</p>
                                    {selectedLog.details ? (
                                      <pre className="bg-muted p-4 rounded-md mt-1 overflow-auto max-h-[300px] text-sm">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                      </pre>
                                    ) : (
                                      <p className="text-md mt-1 text-muted-foreground">No details available</p>
                                    )}
                                  </div>
                                  
                                  <div className="flex justify-between">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteLog(selectedLog.id)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete this log
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLog(log.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}