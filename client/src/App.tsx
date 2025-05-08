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
import TestSpentValuePage from "@/pages/test-spent-value";
import OriginalUrlRecordsPage from "@/pages/original-url-records-page";
import CampaignClickRecordsPage from "@/pages/campaign-click-records-page";
import CampaignClickDetailPage from "@/pages/campaign-click-detail-page";
import UrlClickRecordsPage from "@/pages/url-click-records-page";
import DetailedUrlRecordPage from "@/pages/detailed-url-record-page";
import UrlBudgetLogsPage from "@/pages/url-budget-logs";
import YoutubeUrlRecordsPage from "@/pages/youtube-url-records";
import YouTubeApiLogsPage from "@/pages/youtube-api-logs";
import ApiTesterPage from "@/pages/api-tester";
import LoginPage from "@/pages/login-page";
import AppLayout from "@/components/layout/app-layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

// Authentication is now enabled - set to false to require login
const BYPASS_LOGIN = false; // Login and protected routes are now enforced

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
  
  // TEMPORARY FOR DEVELOPMENT: Bypass authentication completely
  if (BYPASS_LOGIN) {
    return (
      <AppLayout>
        <Switch>
          <Route path="/login">
            <Redirect to="/campaigns" />
          </Route>
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
          <Route path="/test-spent-value">
            <TestSpentValuePage />
          </Route>
          <Route path="/original-url-records">
            <OriginalUrlRecordsPage />
          </Route>
          <Route path="/campaign-click-records">
            <CampaignClickRecordsPage />
          </Route>
          <Route path="/campaign-click-detail/:id">
            <CampaignClickDetailPage />
          </Route>
          <Route path="/url-click-records">
            <UrlClickRecordsPage />
          </Route>
          <Route path="/detailed-url-record/:urlId">
            <DetailedUrlRecordPage />
          </Route>
          <Route path="/url-budget-logs">
            <UrlBudgetLogsPage />
          </Route>
          <Route path="/youtube-url-records">
            <YoutubeUrlRecordsPage />
          </Route>
          <Route path="/youtube-api-logs">
            <YouTubeApiLogsPage />
          </Route>
          <Route path="/api-tester">
            <ApiTesterPage />
          </Route>
          <Route>
            <NotFound />
          </Route>
        </Switch>
      </AppLayout>
    );
  }
  
  // Normal production mode with authentication
  if (location === "/login") {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
      </Switch>
    );
  }
  
  return (
    <ProtectedRoute>
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
          <Route path="/test-spent-value">
            <TestSpentValuePage />
          </Route>
          <Route path="/original-url-records">
            <OriginalUrlRecordsPage />
          </Route>
          <Route path="/campaign-click-records">
            <CampaignClickRecordsPage />
          </Route>
          <Route path="/campaign-click-detail/:id">
            <CampaignClickDetailPage />
          </Route>
          <Route path="/url-click-records">
            <UrlClickRecordsPage />
          </Route>
          <Route path="/detailed-url-record/:urlId">
            <DetailedUrlRecordPage />
          </Route>
          <Route path="/url-budget-logs">
            <UrlBudgetLogsPage />
          </Route>
          <Route path="/youtube-url-records">
            <YoutubeUrlRecordsPage />
          </Route>
          <Route path="/youtube-api-logs">
            <YouTubeApiLogsPage />
          </Route>
          <Route path="/api-tester">
            <ApiTesterPage />
          </Route>
          <Route>
            <NotFound />
          </Route>
        </Switch>
      </AppLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;