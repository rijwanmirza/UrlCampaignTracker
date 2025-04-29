import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, LineChart, Calendar, Clock, Globe, ChevronRight } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Analytics Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-6 w-6 mr-2" />
              Campaign Analytics
            </CardTitle>
            <CardDescription>
              View detailed statistics for your campaigns
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Monitor campaign performance, track clicks over time, and analyze user behavior
              for all your campaigns with advanced filtering options.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Date range filters</span>
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Hourly breakdown</span>
              </div>
              <div className="flex items-center">
                <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Timezone selection</span>
              </div>
              <div className="flex items-center">
                <LineChart className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Trend analysis</span>
              </div>
            </div>
            <Link href="/analytics/campaigns">
              <Button className="w-full">
                Select Campaign <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <LineChart className="h-6 w-6 mr-2" />
              URL Analytics
            </CardTitle>
            <CardDescription>
              Track performance of individual URLs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Analyze click patterns, referrer sources, and user interaction metrics for 
              specific URLs with comprehensive filtering capabilities.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Date range filters</span>
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Hourly breakdown</span>
              </div>
              <div className="flex items-center">
                <Globe className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Timezone selection</span>
              </div>
              <div className="flex items-center">
                <LineChart className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm">Referrer analysis</span>
              </div>
            </div>
            <Link href="/analytics/urls">
              <Button className="w-full">
                Select URL <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Analytics Features</CardTitle>
          <CardDescription>
            Comprehensive tools to analyze your traffic and campaign performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2">Date Range Filters</h3>
              <ul className="space-y-1 text-sm">
                <li>• Total (all-time data)</li>
                <li>• This year / Last year</li>
                <li>• Today / Yesterday</li>
                <li>• Last 2-7 days</li>
                <li>• This month / Last month</li>
                <li>• Last 6 months</li>
                <li>• Custom date range</li>
              </ul>
            </div>
            
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2">Time Analysis</h3>
              <ul className="space-y-1 text-sm">
                <li>• Timezone selection</li>
                <li>• Hourly breakdown (24-hour view)</li>
                <li>• Day-by-day comparison</li>
                <li>• Peak traffic identification</li>
                <li>• Custom time range analysis</li>
              </ul>
            </div>
            
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2">Metrics & Insights</h3>
              <ul className="space-y-1 text-sm">
                <li>• Click tracking</li>
                <li>• Device & browser statistics</li>
                <li>• Referrer source analysis</li>
                <li>• Campaign comparisons</li>
                <li>• URL performance ranking</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}