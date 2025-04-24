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

function Router() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  
  // Check if current location is a redirect route
  const isRedirectRoute = 
    location.startsWith("/r/") || 
    location.startsWith("/views/") || 
    location.startsWith("/c/");
  
  // Render different route sets based on the current location
  if (isRedirectRoute) {
    // Standalone routes without layout/navbar
    return (
      <Switch>
        <Route path="/r/:campaignId/:urlId" component={RedirectPage} />
        <Route path="/r/bridge/:campaignId/:urlId" component={RedirectPage} />
        <Route path="/views/:customPath" component={RedirectPage} />
        <Route path="/c/:campaignId" component={RedirectPage} />
      </Switch>
    );
  }
  
  // App routes with navbar
  return (
    <AppLayout>
      <Switch>
        <Route path="/">
          <Redirect to="/campaigns" />
        </Route>
        <Route path="/campaigns/:id">
          <Home />
        </Route>
        <Route path="/campaigns">
          <CampaignList />
        </Route>
        <Route path="/urls">
          {isMobile ? <URLsMobilePage /> : <URLsPage />}
        </Route>
        <Route path="/gmail-settings">
          <GmailSettingsPage />
        </Route>
        <Route path="/system-settings">
          <SystemSettingsPage />
        </Route>
        <Route path="/trafficstar">
          <TrafficstarPage />
        </Route>
        <Route path="/redirect-test">
          <RedirectTest />
        </Route>
        <Route>
          <NotFound />
        </Route>
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
