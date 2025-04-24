import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle2 } from "lucide-react";

interface MigrationResponse {
  message: string;
  details?: string;
}

export default function DecimalMultiplierMigration() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const runMigration = async () => {
    try {
      setIsRunning(true);
      setResult(null);
      
      // Make the migration request
      const response = await fetch("/api/system/migrate-decimal-multiplier", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      const data = await response.json() as MigrationResponse;
      
      if (response.ok) {
        // Success
        setResult({
          success: true,
          message: data.message || data.details || "Migration completed successfully"
        });
        
        toast({
          title: "Migration Successful",
          description: data.message || "Decimal multiplier migration completed successfully"
        });
      } else {
        // API error
        setResult({
          success: false,
          message: data.message || "Migration failed"
        });
        
        toast({
          title: "Migration Failed",
          description: data.message || "Failed to run the decimal multiplier migration",
          variant: "destructive"
        });
      }
    } catch (error) {
      // Network or other error
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Migration failed with an unknown error"
      });
      
      toast({
        title: "Migration Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Database Migration: Decimal Multiplier Support</CardTitle>
        <CardDescription>
          Update the database schema to support decimal multipliers (like 1.5, 2.33). This is a one-time migration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result && (
          <Alert className={result.success ? "bg-green-50" : "bg-red-50"}>
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <div className="h-4 w-4 text-red-600">!</div>
              )}
              <AlertTitle>{result.success ? "Success" : "Error"}</AlertTitle>
            </div>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={runMigration}
          disabled={isRunning}
          variant="outline"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Migration...
            </>
          ) : (
            "Run Decimal Multiplier Migration"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}