import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "@/components/ui/date-picker";
import { format, parseISO, subDays } from "date-fns";
import {
  Table,
  TableBody,
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
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronLeft, ChevronRight, Calendar, BarChart2, ListFilter } from "lucide-react";

// Format date in a human-readable format
function formatDate(dateString: string) {
  try {
    const date = parseISO(dateString);
    return format(date, "MMM dd, yyyy HH:mm:ss");
  } catch (error) {
    return dateString;
  }
}

// Truncate text with ellipsis for display
function truncateText(text: string, maxLength = 50) {
  if (!text) return "";
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}

export default function CampaignClickRecordsPage() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("today");
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [showHourly, setShowHourly] = useState<boolean>(false);
  
  // Build the query parameters for the API call
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      page: page.toString(),
      limit: limit.toString(),
      filterType
    };
    
    if (search) params.search = search;
    if (selectedCampaignId) params.campaignId = selectedCampaignId;
    
    if (filterType === "custom_range" && startDate && endDate) {
      params.startDate = format(startDate, "yyyy-MM-dd");
      params.endDate = format(endDate, "yyyy-MM-dd");
    }
    
    params.showHourly = showHourly.toString();
    
    return params;
  }, [page, limit, search, selectedCampaignId, filterType, startDate, endDate, showHourly]);
  
  // Fetch campaign click records
  const { 
    data: recordsData, 
    isLoading: isLoadingRecords 
  } = useQuery({
    queryKey: ['/api/campaign-click-records', queryParams],
    enabled: true,
  });
  
  // Fetch campaigns for dropdown
  const { 
    data: campaignsData, 
    isLoading: isLoadingCampaigns 
  } = useQuery({
    queryKey: ['/api/campaigns'],
    enabled: true,
  });
  
  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };
  
  // Handle campaign change
  const handleCampaignChange = (value: string) => {
    setSelectedCampaignId(value);
    setPage(1); // Reset to first page
  };
  
  // Handle filter type change
  const handleFilterTypeChange = (value: string) => {
    setFilterType(value);
    setPage(1); // Reset to first page
  };
  
  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };
  
  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to first page
  };
  
  // Navigate to the detail page for a specific campaign
  const viewCampaignDetail = (campaignId: number) => {
    setLocation(`/campaign-click-detail/${campaignId}?filterType=${filterType}${
      filterType === 'custom_range' && startDate && endDate 
        ? `&startDate=${format(startDate, 'yyyy-MM-dd')}&endDate=${format(endDate, 'yyyy-MM-dd')}` 
        : ''
    }`);
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold">Campaign Click Records</CardTitle>
              <CardDescription>View and analyze click records for your campaigns</CardDescription>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHourly(!showHourly)}
              >
                {showHourly ? 
                  <><BarChart2 className="h-4 w-4 mr-2" /> Hide Hourly Breakdown</> : 
                  <><BarChart2 className="h-4 w-4 mr-2" /> Show Hourly Breakdown</>
                }
              </Button>
              
              {selectedCampaignId && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => viewCampaignDetail(parseInt(selectedCampaignId))}
                >
                  <BarChart2 className="h-4 w-4 mr-2" />
                  View Detailed Breakdown
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs defaultValue="filter" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="filter">Filter Records</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
            </TabsList>
            
            <TabsContent value="filter" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4">
                <div>
                  <Select 
                    value={selectedCampaignId} 
                    onValueChange={handleCampaignChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Campaigns</SelectItem>
                      {campaignsData?.map((campaign: any) => (
                        <SelectItem key={campaign.id} value={campaign.id.toString()}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Select 
                    value={filterType} 
                    onValueChange={handleFilterTypeChange}
                  >
                    <SelectTrigger className="w-full">
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
                
                {filterType === 'custom_range' && (
                  <>
                    <div>
                      <DatePicker
                        selected={startDate}
                        onSelect={setStartDate}
                        disabled={isLoadingRecords}
                        placeholder="Start Date"
                      />
                    </div>
                    <div>
                      <DatePicker
                        selected={endDate}
                        onSelect={setEndDate}
                        disabled={isLoadingRecords}
                        placeholder="End Date"
                      />
                    </div>
                  </>
                )}
                
                <div className="lg:col-span-2 xl:col-span-3">
                  <Select 
                    value={limit.toString()} 
                    onValueChange={(value) => setLimit(parseInt(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Rows per page" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 per page</SelectItem>
                      <SelectItem value="25">25 per page</SelectItem>
                      <SelectItem value="50">50 per page</SelectItem>
                      <SelectItem value="100">100 per page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="search">
              <form onSubmit={handleSearchSubmit} className="flex gap-2 mt-4">
                <Input
                  type="text"
                  placeholder="Search by IP, user agent, or referrer..."
                  value={search}
                  onChange={handleSearchChange}
                  className="flex-1"
                />
                <Button type="submit">Search</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-0">
          {isLoadingRecords || isLoadingCampaigns ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Timestamp</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>User Agent</TableHead>
                      <TableHead>Referer</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordsData?.records?.length > 0 ? (
                      recordsData.records.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">
                            {formatDate(record.timestamp)}
                          </TableCell>
                          <TableCell>
                            {record.campaignName || `Campaign #${record.campaignId}`}
                          </TableCell>
                          <TableCell>
                            {record.urlName || (record.urlId ? `URL #${record.urlId}` : '-')}
                          </TableCell>
                          <TableCell>{record.ipAddress}</TableCell>
                          <TableCell title={record.userAgent}>
                            {truncateText(record.userAgent, 30)}
                          </TableCell>
                          <TableCell title={record.referer}>
                            {record.referer ? truncateText(record.referer, 30) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewCampaignDetail(record.campaignId)}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6">
                          No click records found. Try changing your filter or search criteria.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {recordsData?.records?.length > 0 && (
                <div className="py-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => page > 1 && handlePageChange(page - 1)}
                          className={page === 1 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {/* Show first page if not visible */}
                      {page > 3 && (
                        <PaginationItem>
                          <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
                        </PaginationItem>
                      )}
                      
                      {/* Show ellipsis if needed */}
                      {page > 4 && (
                        <PaginationItem>
                          <PaginationLink disabled>...</PaginationLink>
                        </PaginationItem>
                      )}
                      
                      {/* Show surrounding pages */}
                      {Array.from({ length: 3 }, (_, i) => {
                        const pageNumber = page - 1 + i;
                        if (pageNumber <= 0 || pageNumber > Math.ceil((recordsData?.total || 0) / limit)) return null;
                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink 
                              isActive={pageNumber === page}
                              onClick={() => handlePageChange(pageNumber)}
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      
                      {/* Show ellipsis if needed */}
                      {page < Math.ceil((recordsData?.total || 0) / limit) - 3 && (
                        <PaginationItem>
                          <PaginationLink disabled>...</PaginationLink>
                        </PaginationItem>
                      )}
                      
                      {/* Show last page if not visible */}
                      {page < Math.ceil((recordsData?.total || 0) / limit) - 2 && (
                        <PaginationItem>
                          <PaginationLink onClick={() => handlePageChange(Math.ceil((recordsData?.total || 0) / limit))}>
                            {Math.ceil((recordsData?.total || 0) / limit)}
                          </PaginationLink>
                        </PaginationItem>
                      )}
                      
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => page < Math.ceil((recordsData?.total || 0) / limit) && handlePageChange(page + 1)}
                          className={page >= Math.ceil((recordsData?.total || 0) / limit) ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}