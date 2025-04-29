import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, parseISO, subDays } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Search, ChevronRight, Bar, LineChart, BarChart2 } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface CampaignClickRecord {
  id: number;
  campaignId: number;
  campaignName: string;
  urlId: number;
  originalUrl: string;
  ip: string;
  userAgent: string;
  referrer: string | null;
  createdAt: string;
}

interface Campaign {
  id: number;
  name: string;
}

export default function CampaignClickRecordsPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("today");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage] = useState(20);
  
  // Calculate query parameters based on filter settings
  const queryParams: Record<string, string> = {
    filterType,
    page: currentPage.toString(),
    limit: recordsPerPage.toString(),
  };
  
  if (searchTerm) {
    queryParams.search = searchTerm;
  }
  
  if (campaignFilter !== "all") {
    queryParams.campaignId = campaignFilter;
  }
  
  if (filterType === 'custom_range' && startDate && endDate) {
    queryParams.startDate = format(startDate, 'yyyy-MM-dd');
    queryParams.endDate = format(endDate, 'yyyy-MM-dd');
  }
  
  // Fetch campaigns for the filter dropdown
  const { data: campaigns } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });
  
  // Fetch click records with filters
  const { 
    data: clickRecordsResponse, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['/api/campaign-click-records', queryParams],
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      const response = await fetch(`/api/campaign-click-records?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch campaign click records');
      }
      
      return response.json();
    },
  });
  
  // Extract data from response
  const clickRecords = clickRecordsResponse?.records || [];
  const totalRecords = clickRecordsResponse?.total || 0;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  
  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on new search
  };
  
  // Handle filter type change
  const handleFilterTypeChange = (value: string) => {
    setFilterType(value);
    setCurrentPage(1); // Reset to first page on filter change
  };
  
  // Handle campaign filter change
  const handleCampaignFilterChange = (value: string) => {
    setCampaignFilter(value);
    setCurrentPage(1); // Reset to first page on filter change
  };
  
  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };
  
  // Navigate to detail view
  const handleViewDetails = (campaignId: number) => {
    const queryString = new URLSearchParams({
      filterType,
      ...(filterType === 'custom_range' ? {
        startDate: format(startDate || new Date(), 'yyyy-MM-dd'),
        endDate: format(endDate || new Date(), 'yyyy-MM-dd')
      } : {})
    }).toString();
    
    setLocation(`/campaign-click-detail/${campaignId}?${queryString}`);
  };
  
  // Format date/time for display
  const formatDateTime = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return format(date, 'MMM dd, yyyy HH:mm:ss');
    } catch (e) {
      return dateString;
    }
  };
  
  // Generate pagination items
  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if there are few of them
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              isActive={currentPage === i}
              onClick={() => handlePageChange(i)}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      // Always show first page
      items.push(
        <PaginationItem key={1}>
          <PaginationLink
            isActive={currentPage === 1}
            onClick={() => handlePageChange(1)}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );
      
      // Calculate range of pages to show around current page
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);
      
      // Adjust if near the start
      if (currentPage <= 3) {
        endPage = Math.min(4, totalPages - 1);
      }
      
      // Adjust if near the end
      if (currentPage >= totalPages - 2) {
        startPage = Math.max(2, totalPages - 3);
      }
      
      // Show ellipsis if needed before middle pages
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      
      // Show middle pages
      for (let i = startPage; i <= endPage; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              isActive={currentPage === i}
              onClick={() => handlePageChange(i)}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
      
      // Show ellipsis if needed after middle pages
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      
      // Always show last page
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            isActive={currentPage === totalPages}
            onClick={() => handlePageChange(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return items;
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold">Campaign Click Records</CardTitle>
              <CardDescription>
                View and analyze individual campaign redirect traffic
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-4 mb-6">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div className="relative">
                <Input
                  placeholder="Search by IP or URL..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-9"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              
              <div>
                <Select
                  value={filterType}
                  onValueChange={handleFilterTypeChange}
                >
                  <SelectTrigger>
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filter by Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="custom_range">Custom Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select
                  value={campaignFilter}
                  onValueChange={handleCampaignFilterChange}
                >
                  <SelectTrigger>
                    <BarChart2 className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filter by Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns?.map((campaign: Campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id.toString()}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {filterType === 'custom_range' && (
                <>
                  <div>
                    <DatePicker
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={isLoading}
                      placeholder="Start Date"
                    />
                  </div>
                  <div>
                    <DatePicker
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={isLoading}
                      placeholder="End Date"
                    />
                  </div>
                </>
              )}
            </div>
            
            {campaignFilter !== "all" && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewDetails(parseInt(campaignFilter))}
                >
                  <LineChart className="mr-2 h-4 w-4" />
                  View Detailed Analysis
                </Button>
              </div>
            )}
          </div>
          
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load campaign click records. Please try again later.
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            </div>
          ) : clickRecords.length === 0 ? (
            <div className="text-center py-20 border rounded-md bg-muted/10">
              <p className="text-muted-foreground mb-2">No records found for the selected filters</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search criteria or selecting a different date range</p>
            </div>
          ) : (
            <>
              <Table className="mb-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="hidden md:table-cell">IP Address</TableHead>
                    <TableHead className="hidden lg:table-cell">Referrer</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clickRecords.map((record: CampaignClickRecord) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(record.createdAt)}
                      </TableCell>
                      <TableCell>{record.campaignName}</TableCell>
                      <TableCell className="hidden md:table-cell">{record.ip}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-[200px] truncate">
                        {record.referrer || '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {record.originalUrl}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDetails(record.campaignId)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationPrevious 
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    />
                    
                    {renderPaginationItems()}
                    
                    <PaginationNext
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    />
                  </PaginationContent>
                </Pagination>
              )}
              
              <div className="text-sm text-muted-foreground text-center mt-4">
                Showing {Math.min((currentPage - 1) * recordsPerPage + 1, totalRecords)} to {Math.min(currentPage * recordsPerPage, totalRecords)} of {totalRecords} records
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}