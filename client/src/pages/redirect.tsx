import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowRight, Link2 } from "lucide-react";

export default function RedirectPage() {
  const { campaignId, urlId } = useParams<{ campaignId: string; urlId: string }>();
  const [status, setStatus] = useState<"loading" | "redirecting" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const performRedirect = async () => {
      try {
        if (!campaignId || !urlId) {
          setStatus("error");
          setError("Invalid redirect parameters");
          return;
        }

        // Attempt to fetch the redirection URL
        const response = await fetch(`/r/${campaignId}/${urlId}`, {
          method: "GET",
          redirect: "manual", // Prevent automatic redirect to handle it ourselves
        });

        if (response.type === "opaqueredirect") {
          // This means the redirect is happening and we're good
          setStatus("redirecting");
          // The browser will follow the redirect automatically
          return;
        }

        if (!response.ok) {
          setStatus("error");
          const data = await response.json();
          setError(data.message || "Redirect failed");
          return;
        }

        // If for some reason we get here but haven't redirected,
        // we'll show an error
        setStatus("error");
        setError("Unexpected redirect response");
      } catch (err) {
        setStatus("error");
        setError("Network error while redirecting");
      }
    };

    performRedirect();
  }, [campaignId, urlId]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {status === "loading" && (
            <div className="flex flex-col items-center py-8">
              <div className="h-12 w-12 rounded-full border-4 border-t-primary border-gray-200 animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-900">Preparing redirect...</p>
            </div>
          )}

          {status === "redirecting" && (
            <div className="flex flex-col items-center py-8">
              <div className="flex items-center mb-4 text-primary">
                <Link2 className="h-8 w-8 mr-2" />
                <ArrowRight className="h-6 w-6 animate-pulse" />
              </div>
              <p className="text-lg font-medium text-gray-900">Redirecting you now...</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center py-8">
              <div className="flex items-center mb-4 text-red-500">
                <AlertCircle className="h-10 w-10" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Redirect Failed</h2>
              <p className="text-center text-gray-600">{error || "Unable to redirect to the requested URL"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
