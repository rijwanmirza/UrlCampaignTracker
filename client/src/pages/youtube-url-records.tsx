import { useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Trash, Filter } from "lucide-react";
import { formatDistance } from 'date-fns';

// Type for YouTube URL record
interface YoutubeUrlRecord {
  id: number;
  campaignId: number;
  campaignName: string;
  name: string;
  targetUrl: string;
  youtubeVideoId: string;
  deletionReason: string;
  createdAt: string;
  deletedAt: string;
}

export default function YoutubeUrlRecordsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [limit] = useState(50);
  const [rejectionFilter, setRejectionFilter] = useState<string>("all");

  // Fetch YouTube URL records
  const {
    data,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['/api/youtube-url-records', page, limit, search, campaignId],
    queryFn: async () => {
      let url = `/api/youtube-url-records?page=${page}&limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (campaignId && campaignId !== 'all') url += `&campaignId=${campaignId}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch YouTube URL records');
      }
      return response.json();
    },
  });

  // Fetch all campaigns for filter dropdown
  const { data: campaignsData } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      return response.json();
    },
  });

  // Mutation for bulk delete
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch('/api/youtube-url-records/bulk/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete records');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${selectedIds.length} record(s) deleted successfully`,
      });
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['/api/youtube-url-records'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} record(s)?`)) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };

  // Toggle selection of a record
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id)
        : [...prev, id]
    );
  };

  // Toggle selection of all records on current page
  const toggleSelectAll = () => {
    const filteredRecords = getFilteredRecords();
    if (filteredRecords.length === 0) return;
    
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map((record: YoutubeUrlRecord) => record.id));
    }
  };

  // Format deletion reason for display
  const formatDeletionReason = (record: YoutubeUrlRecord) => {
    const reason = record.deletionReason;
    
    // First check if this is a direct rejection
    if (reason.includes('Direct Rejected') || reason.startsWith('[Direct Rejected]')) {
      // Extract the actual reason from the Direct Rejected prefix if present
      let actualReason = reason;
      if (reason.includes('[Direct Rejected]')) {
        actualReason = reason.replace('[Direct Rejected] ', '');
      }
      
      // For exceeds maximum duration
      if (actualReason.includes('exceeds maximum duration')) {
        return <Badge variant="destructive">Direct Rejected [Video exceeds maximum duration]</Badge>;
      }
      
      // For all other direct rejections
      return <Badge variant="destructive">Direct Rejected [{actualReason}]</Badge>;
    } 
    // Handle standard YouTube API rejection reasons
    else if (reason.includes('Age restricted video') || reason.includes('age_restricted')) {
      return <Badge variant="destructive">Age Restricted</Badge>;
    } else if (reason.includes('Video made for kids') || reason.includes('made_for_kids')) {
      return <Badge>Made for Kids</Badge>;
    } else if (reason.includes('Video restricted in') || reason.includes('country_restricted')) {
      return <Badge variant="secondary">Country Restricted</Badge>;
    } else if (reason.includes('Private video') || reason.includes('private')) {
      return <Badge variant="outline">Private Video</Badge>;
    } else if (reason.includes('Video not found') || reason.includes('deleted') || reason.includes('unavailable')) {
      return <Badge variant="destructive">Video not found (deleted or unavailable)</Badge>;
    } else {
      // For any other reasons, show the full text
      return <Badge>{reason || 'Unknown'}</Badge>;
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return formatDistance(date, new Date(), { addSuffix: true });
    } catch (e) {
      return dateString;
    }
  };
  
  // Check if record is of direct rejected type
  const isDirectRejected = (record: YoutubeUrlRecord) => {
    return record.deletionReason.includes('Direct Rejected') || record.deletionReason.startsWith('[Direct Rejected]');
  };

  // Get filtered records based on rejectionFilter
  const getFilteredRecords = () => {
    if (!data?.records) return [];
    
    if (rejectionFilter === 'direct') {
      return data.records.filter(record => isDirectRejected(record));
    } else if (rejectionFilter === 'regular') {
      return data.records.filter(record => !isDirectRejected(record));
    }
    
    return data.records;
  };

  return (
    <div className="container mx-auto py-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">YouTube URL Records</h1>
          
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="flex items-center gap-2"
            >
              <Trash className="h-4 w-4" />
              {bulkDeleteMutation.isPending 
                ? "Deleting..." 
                : `Delete Selected (${selectedIds.length})`}
            </Button>
          )}
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by name, URL, video ID or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="w-full md:w-1/4">
            <Select
              value={campaignId}
              onValueChange={setCampaignId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaignsData?.map((campaign: any) => (
                  <SelectItem key={campaign.id} value={campaign.id.toString()}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={() => {
              setPage(1);
              refetch();
            }}
          >
            Search
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="font-medium">Filter by status:</span>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              type="button"
              variant={rejectionFilter === 'all' ? 'default' : 'outline'}
              className="rounded-none"
              onClick={() => setRejectionFilter('all')}
            >
              All Videos
            </Button>
            <Button
              type="button"
              variant={rejectionFilter === 'direct' ? 'default' : 'outline'}
              className="rounded-none"
              onClick={() => setRejectionFilter('direct')}
            >
              Rejected Videos
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-center py-8">Loading records...</div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableCaption>
                  {data?.total 
                    ? `Showing ${getFilteredRecords().length} ${rejectionFilter === 'direct' ? 'rejected' : rejectionFilter === 'regular' ? 'regular' : ''} YouTube URL records` 
                    : "No YouTube URL records found"}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={getFilteredRecords().length > 0 && selectedIds.length === getFilteredRecords().length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>URL Name</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Target URL</TableHead>
                    <TableHead>Video ID</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Deleted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getFilteredRecords().length > 0 ? (
                    getFilteredRecords().map((record: YoutubeUrlRecord) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(record.id)}
                            onCheckedChange={() => toggleSelection(record.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{record.name}</TableCell>
                        <TableCell>{record.campaignName}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <a 
                            href={record.targetUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {record.targetUrl}
                          </a>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`https://www.youtube.com/watch?v=${record.youtubeVideoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            {record.youtubeVideoId}
                          </a>
                        </TableCell>
                        <TableCell>{formatDeletionReason(record)}</TableCell>
                        <TableCell>{formatRelativeTime(record.deletedAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center">
                        No YouTube URL records found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            {data?.totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                    .filter(p => {
                      // Show first page, last page, current page and pages around current
                      return (
                        p === 1 || 
                        p === data.totalPages || 
                        (p >= page - 1 && p <= page + 1)
                      );
                    })
                    .map((p, i, arr) => {
                      // Add ellipsis between non-consecutive pages
                      const showEllipsisBefore = i > 0 && arr[i - 1] !== p - 1;
                      
                      return (
                        <div key={p} className="flex items-center">
                          {showEllipsisBefore && (
                            <PaginationItem>
                              <span className="px-2">...</span>
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink
                              onClick={() => setPage(p)}
                              isActive={page === p}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        </div>
                      );
                    })}
                  
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                      className={page === data.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </div>
  );
}