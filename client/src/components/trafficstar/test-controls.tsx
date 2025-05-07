import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Test controls removed as requested.
 * Auto-management functionality has been completely removed from the system.
 */
export function TrafficStarTestControls() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🔔 TrafficStar Management Notice</CardTitle>
          <CardDescription>
            Auto-management functionality has been removed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All auto-management testing features have been removed from the system.
            The system now only tracks spent values without any automatic management features.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}