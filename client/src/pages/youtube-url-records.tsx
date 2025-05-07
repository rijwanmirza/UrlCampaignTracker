import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Search, Trash2, Loader2, AlertCircle } from "lucide-react";
import { YoutubeUrlRecord } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";

export default function YoutubeUrlRecordsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [displayedRecords, setDisplayedRecords] = useState<YoutubeUrlRecord[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Fetch YouTube URL records
  const { data: recordsData, isLoading, isError, refetch } = useQuery<{
    records: YoutubeUrlRecord[];
    totalCount: number;
  }>({
    queryKey: ['/api/youtube-url-records'],
    staleTime: 30000,
    select: (data) => data,
    queryFn: async () => {
      const res = await fetch('/api/youtube-url-records');
      if (!res.ok) {
        throw new Error("Failed to fetch YouTube URL records");
      }
      return res.json();
    }
  });
  
  // Reset selected records when the record data changes
  useEffect(() => {
    if (recordsData?.records) {
      // Only keep selected records that still exist in the current data
      const existingIds = recordsData.records.map((record) => record.id);
      setSelectedRecords(prev => prev.filter(id => existingIds.includes(id)));
      
      // Update selectAll to be true only if all current records are selected
      const allSelected = 
        selectedRecords.length > 0 && 
        existingIds.length > 0 && 
        existingIds.every((id: number) => selectedRecords.includes(id));
        
      setSelectAll(allSelected);
    }
  }, [recordsData, selectedRecords]);

  // Filter records based on search query
  useEffect(() => {
    if (recordsData?.records) {
      if (!searchQuery.trim()) {
        setDisplayedRecords(recordsData.records);
      } else {
        const lowerQuery = searchQuery.toLowerCase().trim();
        const filtered = recordsData.records.filter(record => {
          return (
            record.name?.toLowerCase().includes(lowerQuery) ||
            record.targetUrl?.toLowerCase().includes(lowerQuery) ||
            record.youtubeVideoId?.toLowerCase().includes(lowerQuery) ||
            record.deletionReason?.toLowerCase().includes(lowerQuery) ||
            record.campaignId.toString() === lowerQuery ||
            record.urlId.toString() === lowerQuery
          );
        });
        setDisplayedRecords(filtered);
      }
    }
  }, [searchQuery, recordsData]);

  // Handle select all records
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked && displayedRecords) {
      setSelectedRecords(displayedRecords.map(record => record.id));
    } else {
      setSelectedRecords([]);
    }
  };

  // Handle select individual record
  const handleSelectRecord = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRecords(prev => [...prev, id]);
    } else {
      setSelectedRecords(prev => prev.filter(recordId => recordId !== id));
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) return;
    
    setIsBulkDeleting(true);
    try {
      const response = await apiRequest(
        "POST",
        "/api/youtube-url-records/bulk/delete",
        { ids: selectedRecords }
      );
      
      toast({
        title: "Records Deleted",
        description: `Successfully deleted ${selectedRecords.length} record(s)`,
      });
      
      // Clear selection
      setSelectedRecords([]);
      setSelectAll(false);
      
      // Refetch records
      refetch();
    } catch (error) {
      console.error("Error deleting records:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the selected records. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsBulkDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Format deletion reason for display
  const formatDeletionReason = (record: YoutubeUrlRecord) => {
    const reasons = [];
    
    if (record.countryRestricted) reasons.push("Country Restricted");
    if (record.privateVideo) reasons.push("Private Video");
    if (record.deletedVideo) reasons.push("Deleted Video");
    if (record.ageRestricted) reasons.push("Age Restricted");
    if (record.madeForKids) reasons.push("Made for Kids");
    
    if (reasons.length > 0) {
      return reasons.join(", ");
    } else {
      return record.deletionReason || "Unknown";
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold">YouTube URL Records</h1>
          <p className="text-gray-500">
            View and manage records of YouTube URLs that have been removed due to problematic video statuses.
          </p>
        </div>
        
        {/* Search and actions */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by name, URL, video ID, or reason..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {selectedRecords.length > 0 && (
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedRecords.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {selectedRecords.length} selected YouTube URL record{selectedRecords.length !== 1 ? 's' : ''}.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting}>
                    {isBulkDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Records"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Records Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>YouTube URL Records</CardTitle>
            <CardDescription>
              {displayedRecords?.length
                ? `Showing ${displayedRecords.length} record${displayedRecords.length !== 1 ? 's' : ''}`
                : isLoading
                ? "Loading records..."
                : "No records found"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isError ? (
              <Alert variant="destructive" className="mx-6 mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load YouTube URL records. Please try again.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all records"
                        />
                      </TableHead>
                      <TableHead className="w-12">ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Video ID</TableHead>
                      <TableHead>Deletion Reason</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead>Campaign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
                        </TableCell>
                      </TableRow>
                    ) : displayedRecords?.length ? (
                      displayedRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={(checked) => handleSelectRecord(record.id, !!checked)}
                              aria-label={`Select record ${record.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{record.id}</TableCell>
                          <TableCell>{record.name || 'Unnamed'}</TableCell>
                          <TableCell className="truncate max-w-xs">
                            {record.targetUrl ? (
                              <a 
                                href={record.targetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                {record.targetUrl}
                              </a>
                            ) : (
                              <span className="text-gray-400">No URL</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {record.youtubeVideoId ? (
                              <a 
                                href={`https://www.youtube.com/watch?v=${record.youtubeVideoId}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                {record.youtubeVideoId}
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>{record.deletionReason || "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {record.countryRestricted && <Badge variant="outline" className="bg-red-50">Country Restricted</Badge>}
                              {record.privateVideo && <Badge variant="outline" className="bg-yellow-50">Private</Badge>}
                              {record.deletedVideo && <Badge variant="outline" className="bg-red-50">Deleted</Badge>}
                              {record.ageRestricted && <Badge variant="outline" className="bg-orange-50">Age Restricted</Badge>}
                              {record.madeForKids && <Badge variant="outline" className="bg-blue-50">Made for Kids</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(record.deletedAt)}</TableCell>
                          <TableCell>
                            <Badge>{record.campaignId}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          No records found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}