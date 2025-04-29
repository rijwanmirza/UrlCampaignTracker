import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, CalendarDays, ArrowRight } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Campaign Analytics</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="h-6 w-6 mr-2" />
            Campaign Click Analytics
          </CardTitle>
          <CardDescription>
            View campaign click statistics with date filtering
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            Monitor campaign click performance with time-based filtering options.
            Track click counts across different date ranges and campaigns.
          </p>
          
          <div className="border rounded-lg p-4 mb-4">
            <h3 className="font-medium text-lg mb-2">Features</h3>
            <ul className="space-y-1 text-sm grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Today / Yesterday filters</span>
              </li>
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Last 7 days filter</span>
              </li>
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>This month / Last month</span>
              </li>
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>All time data</span>
              </li>
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Timezone selection</span>
              </li>
              <li className="flex items-center">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>Campaign filtering</span>
              </li>
            </ul>
          </div>
          
          <Link href="/analytics/campaigns">
            <Button size="lg" className="w-full md:w-auto">
              View Campaign Clicks <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}