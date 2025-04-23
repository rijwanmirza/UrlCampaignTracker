import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { RedirectMethod } from "@shared/schema";

// High-performance redirect page with no visible UI for instant redirects
export default function RedirectPage() {
  const [, setLocation] = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Match routes with better performance
  const [matchCampaignUrlRoute, campaignUrlParams] = useRoute<{ campaignId: string, urlId: string }>("/r/:campaignId/:urlId");
  const [matchBridgeRoute, bridgeParams] = useRoute<{ campaignId: string, urlId: string }>("/r/bridge/:campaignId/:urlId");
  const [matchCustomPathRoute, customPathParams] = useRoute<{ customPath: string }>("/views/:customPath");
  const [matchCampaignRotationRoute, campaignRotationParams] = useRoute<{ campaignId: string }>("/c/:campaignId");
  
  // Determine request path
  let requestPath = "";
  if (matchCampaignUrlRoute && campaignUrlParams) {
    requestPath = `/api/urls/${campaignUrlParams.urlId}?campaignId=${campaignUrlParams.campaignId}`;
  } else if (matchBridgeRoute && bridgeParams) {
    requestPath = `/api/urls/${bridgeParams.urlId}?campaignId=${bridgeParams.campaignId}`;
  } else if (matchCustomPathRoute && customPathParams) {
    requestPath = `/api/campaigns/path/${customPathParams.customPath}`;
  } else if (matchCampaignRotationRoute && campaignRotationParams) {
    requestPath = `/api/campaigns/${campaignRotationParams.campaignId}`;
  }
  
  // Fetch the redirect data
  const { data, error } = useQuery({
    queryKey: [requestPath],
    enabled: !!requestPath,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    gcTime: 0, // Don't keep in cache
    staleTime: 0, // Always fetch fresh
  });
  
  // Handle redirects
  useEffect(() => {
    if (!data) return;
    
    // Get the target URL if it exists
    const targetUrl = typeof data === 'object' && data !== null && 'targetUrl' in data 
      ? (data as any).targetUrl 
      : null;
    
    // Handle campaign data without target URL (direct campaign access)
    if (!targetUrl && typeof data === 'object' && data !== null && 'id' in data) {
      setLocation(`/campaigns/${(data as any).id}`);
      return;
    }
    
    // Show error if no target URL
    if (!targetUrl) {
      setErrorMessage("Invalid URL or campaign");
      return;
    }
    
    // Default to direct redirect
    window.location.replace(targetUrl);
  }, [data, setLocation]);
  
  // Handle errors
  useEffect(() => {
    if (error) {
      setErrorMessage("This link appears to be invalid or has expired.");
    }
  }, [error]);
  
  // Only show UI if there's an error, otherwise completely invisible
  if (!errorMessage) {
    return null;
  }
  
  // Error UI (only shown if needed)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-6 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold mb-2">Redirection Error</h1>
        <p className="text-gray-500 mb-4">{errorMessage}</p>
        <button 
          onClick={() => setLocation("/")}
          className="text-primary hover:underline"
        >
          Return to homepage
        </button>
      </div>
    </div>
  );
}