import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, Search, User, BarChart3, ExternalLink } from "lucide-react";
import { Link } from "wouter";

import AppLayout from "../components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { queryClient } from "@/lib/queryClient";

// Utility to format date for display
function formatDate(dateString: string) {
  const date = new Date(dateString);
  return format(date, 'MMM d, yyyy h:mm:ss a');
}

// Truncate text if it's too long
function truncateText(text: string, maxLength = 50) {
  if (!text) return '';
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}

export default function CampaignClickRecordsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [campaignId, setCampaignId] = useState<number | undefined>(undefined);

  // Query for campaign click records
  const {
    data: clickData,
    isLoading,
    refetch
  } = useQuery({
    queryKey: [
      "/api/campaign-click-records", 
      page, 
      limit, 
      search, 
      filterType, 
      campaignId,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString()
    ],
    queryFn: () => {
      let url = `/api/campaign-click-records?page=${page}&limit=${limit}`;
      
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (campaignId) url += `&campaignId=${campaignId}`;
      
      // Handle date filter
      url += `&filterType=${filterType}`;
      
      if (filterType === 'custom_range' && dateRange?.from && dateRange?.to) {
        url += `&startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`;
      }
      
      return fetch(url).then(res => res.json());
    }
  });

  // Query to get all campaigns for filter dropdown
  const { data: campaignsData } = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: () => fetch("/api/campaigns").then(res => res.json())
  });

  // Columns for data table
  const columns = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => <div className="text-xs font-mono">{row.original.id}</div>,
    },
    {
      accessorKey: "campaignName",
      header: "Campaign",
      cell: ({ row }) => (
        <Link to={`/campaign-click-records/${row.original.campaignId}`} className="font-medium text-blue-600 hover:underline">
          {row.original.campaignName}
        </Link>
      ),
    },
    {
      accessorKey: "urlName",
      header: "URL",
      cell: ({ row }) => (
        <div className="max-w-xs truncate">
          {row.original.urlName || <span className="text-muted-foreground italic">Direct campaign access</span>}
        </div>
      ),
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>{formatDate(row.original.timestamp)}</span>
        </div>
      ),
    },
    {
      accessorKey: "ipAddress",
      header: "IP Address",
      cell: ({ row }) => (
        <div className="font-mono text-xs">
          {row.original.ipAddress || '-'}
        </div>
      ),
    },
    {
      accessorKey: "userAgent",
      header: "User Agent",
      cell: ({ row }) => (
        <div className="max-w-xs text-xs truncate" title={row.original.userAgent}>
          {truncateText(row.original.userAgent, 30) || '-'}
        </div>
      ),
    },
    {
      accessorKey: "referer",
      header: "Referer",
      cell: ({ row }) => (
        <div className="max-w-xs text-xs truncate" title={row.original.referer}>
          {truncateText(row.original.referer, 30) || '-'}
        </div>
      ),
    },
  ];

  // Callback to handle filter changes
  const handleFilterChange = (value: string) => {
    setFilterType(value);
    setPage(1);
  };

  // Handle date range selection
  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setFilterType('custom_range');
      setPage(1);
    }
  };

  // Handle campaign selection
  const handleCampaignChange = (value: string) => {
    setCampaignId(value === 'all' ? undefined : Number(value));
    setPage(1);
  };

  // Handle search input
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setPage(1);
      refetch();
    }
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Handle page size change
  const handlePageSizeChange = (value: string) => {
    setLimit(Number(value));
    setPage(1);
  };

  // Loading state
  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  // Format data for table
  const tableData = clickData?.records.map(record => ({
    ...record,
    campaignName: record.campaignName || `Campaign ${record.campaignId}`,
    urlName: record.urlName || null
  })) || [];

  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Campaign Click Records</h1>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
          >
            Refresh Data
          </Button>
        </div>

        {/* Filter card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Filter click records by campaign, date range, and more
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Campaign filter */}
              <div>
                <label className="text-sm font-medium mb-1 block">Campaign</label>
                <Select onValueChange={handleCampaignChange} defaultValue="all">
                  <SelectTrigger>
                    <SelectValue placeholder="All Campaigns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaignsData?.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id.toString()}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date filter */}
              <div>
                <label className="text-sm font-medium mb-1 block">Time Period</label>
                <Select onValueChange={handleFilterChange} defaultValue={filterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="custom_range">Custom Range</SelectItem>
                    <SelectItem value="total">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom date range */}
              <div className="md:col-span-2">
                <label className="text-sm font-medium mb-1 block">Custom Date Range</label>
                <DatePickerWithRange 
                  date={dateRange}
                  onDateChange={handleDateRangeChange}
                  disabled={filterType !== 'custom_range'}
                />
              </div>

              {/* Search */}
              <div>
                <label className="text-sm font-medium mb-1 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by IP, UserAgent..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearch}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>
              Click Records
              {clickData?.total > 0 && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {clickData.total} records
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Detailed click tracking for all campaign redirects
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Results table */}
            {tableData.length > 0 ? (
              <>
                <DataTable columns={columns} data={tableData} />
                
                {/* Pagination controls */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select
                      value={limit.toString()}
                      onValueChange={handlePageSizeChange}
                    >
                      <SelectTrigger className="w-16">
                        <SelectValue placeholder={limit} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Pagination
                    currentPage={page}
                    totalPages={Math.ceil((clickData?.total || 0) / limit)}
                    onPageChange={handlePageChange}
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-lg font-semibold">No click records found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or check back after some campaign activity
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}