import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { RedirectMethod } from "@shared/schema";
import { Loader2 } from "lucide-react";

export default function RedirectPage() {
  const [, setLocation] = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Match routes
  const [matchCampaignUrlRoute, campaignUrlParams] = useRoute<{ campaignId: string, urlId: string }>("/r/:campaignId/:urlId");
  const [matchBridgeRoute, bridgeParams] = useRoute<{ campaignId: string, urlId: string }>("/r/bridge/:campaignId/:urlId");
  const [matchCustomPathRoute, customPathParams] = useRoute<{ customPath: string }>("/views/:customPath");
  const [matchCampaignRotationRoute, campaignRotationParams] = useRoute<{ campaignId: string }>("/c/:campaignId");
  
  // Determine request path
  let requestPath = "";
  if (matchCampaignUrlRoute && campaignUrlParams) {
    // Direct URL access
    requestPath = `/api/urls/${campaignUrlParams.urlId}?campaignId=${campaignUrlParams.campaignId}`;
  } else if (matchBridgeRoute && bridgeParams) {
    // Secondary bridge access
    requestPath = `/api/urls/${bridgeParams.urlId}?campaignId=${bridgeParams.campaignId}`;
  } else if (matchCustomPathRoute && customPathParams) {
    // Custom path access
    requestPath = `/api/campaigns/path/${customPathParams.customPath}`;
  } else if (matchCampaignRotationRoute && campaignRotationParams) {
    // Campaign rotation access
    requestPath = `/api/campaigns/${campaignRotationParams.campaignId}`;
  }
  
  // Fetch data for the appropriate endpoint
  const { data, error, isLoading } = useQuery({
    queryKey: [requestPath],
    enabled: !!requestPath,
    retry: false,
  });
  
  useEffect(() => {
    if (!data || isRedirecting) return;
    
    // For custom path and campaign rotation routes, we need to check if there's a targetUrl property
    // If not, redirect to a random weighted URL
    if ((matchCustomPathRoute || matchCampaignRotationRoute) && !data.targetUrl) {
      if (data.id) {
        // We got campaign data but no target URL, route to campaign page
        setLocation(`/campaigns/${data.id}`);
      } else {
        setErrorMessage("No valid URLs found in this campaign");
      }
      return;
    }
    
    if (!data.targetUrl) {
      setErrorMessage("Invalid URL or campaign");
      return;
    }
    
    setIsRedirecting(true);
    
    // Different redirect methods
    const redirectMethod = data.redirectMethod || RedirectMethod.DIRECT;
    const targetUrl = data.targetUrl;
    
    switch (redirectMethod) {
      case RedirectMethod.DIRECT:
        // Direct redirect - simple window.location change
        window.location.href = targetUrl;
        break;
      
      case RedirectMethod.META_REFRESH:
        // Meta refresh - use a meta tag to redirect
        const metaRefresh = document.createElement('meta');
        metaRefresh.httpEquiv = 'refresh';
        metaRefresh.content = `0; URL='${targetUrl}'`;
        document.head.appendChild(metaRefresh);
        break;
      
      case RedirectMethod.DOUBLE_META_REFRESH:
        // Double meta refresh - create a bridge page to double redirect
        if (!matchBridgeRoute) {
          // First redirect to bridge
          const urlId = data.id;
          const campaignId = data.campaignId;
          
          if (urlId && campaignId) {
            setLocation(`/r/bridge/${campaignId}/${urlId}`);
          } else {
            // Fallback to direct
            window.location.href = targetUrl;
          }
        } else {
          // Second redirect from bridge to target
          const metaRefresh = document.createElement('meta');
          metaRefresh.httpEquiv = 'refresh';
          metaRefresh.content = `0; URL='${targetUrl}'`;
          document.head.appendChild(metaRefresh);
        }
        break;
      
      case RedirectMethod.HTTP_307:
        // HTTP 307 - fetch with redirect headers
        // Note: This is a client-side simulation of HTTP 307
        // For true HTTP 307, this would be handled server-side
        fetch(targetUrl, {
          redirect: 'follow',
          mode: 'no-cors'
        }).then(() => {
          window.location.href = targetUrl;
        }).catch(() => {
          // Fallback to direct if fetch fails
          window.location.href = targetUrl;
        });
        break;
      
      default:
        // Fallback to direct redirection
        window.location.href = targetUrl;
    }
  }, [data, isRedirecting, matchBridgeRoute, matchCampaignRotationRoute, matchCustomPathRoute, setLocation]);
  
  useEffect(() => {
    if (error) {
      setErrorMessage("Invalid URL or campaign. This link may have expired or been removed.");
    }
  }, [error]);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow p-6 text-center">
        {isLoading || isRedirecting ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
            <h1 className="text-xl font-bold mb-2">Redirecting</h1>
            <p className="text-gray-500">Please wait while we redirect you to your destination...</p>
          </>
        ) : errorMessage ? (
          <>
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
          </>
        ) : null}
      </div>
      
      <div className="mt-8 text-center text-sm text-gray-400">
        <p>Powered by URL Redirector</p>
      </div>
    </div>
  );
}