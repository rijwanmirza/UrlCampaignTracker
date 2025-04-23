import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import URLsPage from "@/pages/urls";
import RedirectPage from "@/pages/redirect";
import AppLayout from "@/components/layout/app-layout";

function Router() {
  const [location] = useLocation();
  
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
        <Route path="/campaigns/:id?" component={Home} />
        <Route path="/urls" component={URLsPage} />
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
