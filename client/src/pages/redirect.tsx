import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { RedirectMethod } from "@shared/schema";

// Optimized high-performance redirect page for handling millions of redirects
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
  
  // Optimized query configuration for high performance
  const { data, error } = useQuery({
    queryKey: [requestPath],
    enabled: !!requestPath,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    gcTime: 0, // Don't keep in cache
    staleTime: 0, // Always fetch fresh
    // Use minimal network resources
    networkMode: "offlineFirst",
  });
  
  useEffect(() => {
    if (!data) return;
    
    // For custom path and campaign rotation routes
    if ((matchCustomPathRoute || matchCampaignRotationRoute) && !data.targetUrl) {
      if (data.id) {
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
    
    // Performance optimization: Use minimal DOM operations
    // Immediate redirect without showing any UI
    const redirectMethod = data.redirectMethod || RedirectMethod.DIRECT;
    const targetUrl = data.targetUrl;
    
    switch (redirectMethod) {
      case RedirectMethod.DIRECT:
        // Use replace for better performance than href
        window.location.replace(targetUrl);
        break;
      
      case RedirectMethod.META_REFRESH:
        // Optimize meta refresh for performance
        const meta = document.createElement('meta');
        meta.httpEquiv = 'refresh';
        meta.content = `0;url=${targetUrl}`;
        document.head.appendChild(meta);
        break;
      
      case RedirectMethod.DOUBLE_META_REFRESH:
        if (!matchBridgeRoute) {
          const urlId = data.id;
          const campaignId = data.campaignId;
          
          if (urlId && campaignId) {
            // Use history API for better performance
            const bridgeUrl = `/r/bridge/${campaignId}/${urlId}`;
            window.history.pushState(null, '', bridgeUrl);
            // Simulate navigation
            window.dispatchEvent(new PopStateEvent('popstate'));
          } else {
            window.location.replace(targetUrl);
          }
        } else {
          // Second redirect from bridge to target - optimize for speed
          const iframe = document.createElement('iframe');
          iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-10000px;top:-10000px;';
          document.body.appendChild(iframe);
          
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              iframeDoc.write(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${targetUrl}"></head></html>`);
              iframeDoc.close();
            } else {
              window.location.replace(targetUrl);
            }
          } catch (e) {
            window.location.replace(targetUrl);
          }
        }
        break;
      
      case RedirectMethod.HTTP_307:
        // Optimize HTTP 307 simulation
        const redirectRequest = new XMLHttpRequest();
        redirectRequest.open('GET', targetUrl, true);
        redirectRequest.onload = () => {
          window.location.replace(targetUrl);
        };
        redirectRequest.onerror = () => {
          window.location.replace(targetUrl);
        };
        redirectRequest.send();
        
        // Fallback after 100ms if XHR is taking too long
        setTimeout(() => {
          window.location.replace(targetUrl);
        }, 100);
        break;
      
      default:
        window.location.replace(targetUrl);
    }
  }, [data, matchBridgeRoute, matchCampaignRotationRoute, matchCustomPathRoute, setLocation]);
  
  useEffect(() => {
    if (error) {
      setErrorMessage("This link appears to be invalid or has expired.");
    }
  }, [error]);
  
  // Return a minimal UI with just error message if needed
  // Most users will never see this as redirects happen instantly
  return (
    <div style={{ display: 'none' }}>
      {errorMessage && (
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
      )}
    </div>
  );
}