import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// This component has been deprecated as we now use only campaign-specific thresholds
export default function ThresholdManager() {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Traffic Generator Thresholds</CardTitle>
        <CardDescription>
          Global thresholds have been deprecated. Please use campaign-specific thresholds 
          in the campaign edit form.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The system now exclusively uses campaign-specific threshold values. 
          You can configure the minimum and remaining click thresholds for each campaign 
          individually in the campaign edit form.
        </p>
      </CardContent>
    </Card>
  );
}