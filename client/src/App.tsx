import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import CampaignList from "@/pages/campaign-list";
import URLsPage from "@/pages/urls";
import URLsMobilePage from "@/pages/urls-mobile";
import RedirectPage from "@/pages/redirect";
import RedirectTest from "@/pages/redirect-test";
import GmailSettingsPage from "@/pages/gmail-settings";
import SystemSettingsPage from "@/pages/system-settings";
import TrafficstarPage from "@/pages/trafficstar";
import AppLayout from "@/components/layout/app-layout";
import { useIsMobile } from "@/hooks/use-mobile";

// Simple app without authentication
function Router() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  
  // Check if current location is a redirect route
  const isRedirectRoute = 
    location.startsWith("/r/") || 
    location.startsWith("/views/") || 
    location.startsWith("/c/");
  
  // For redirect routes (no layout)
  if (isRedirectRoute) {
    return (
      <Switch>
        <Route path="/r/:campaignId/:urlId" component={RedirectPage} />
        <Route path="/r/bridge/:campaignId/:urlId" component={RedirectPage} />
        <Route path="/views/:customPath" component={RedirectPage} />
        <Route path="/c/:campaignId" component={RedirectPage} />
      </Switch>
    );
  }
  
  // For main app routes (with layout)
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/campaigns" />} />
        <Route path="/login" component={() => <Redirect to="/campaigns" />} />
        <Route path="/campaigns/:id" component={Home} />
        <Route path="/campaigns" component={CampaignList} />
        <Route path="/urls">
          {isMobile ? <URLsMobilePage /> : <URLsPage />}
        </Route>
        <Route path="/gmail-settings" component={GmailSettingsPage} />
        <Route path="/system-settings" component={SystemSettingsPage} />
        <Route path="/trafficstar" component={TrafficstarPage} />
        <Route path="/redirect-test" component={RedirectTest} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
