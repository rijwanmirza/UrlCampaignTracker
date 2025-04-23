import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import URLsPage from "@/pages/urls";
import RedirectPage from "@/pages/redirect";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/campaigns" />
      </Route>
      <Route path="/campaigns/:id?" component={Home} />
      <Route path="/urls" component={URLsPage} />
      <Route path="/r/:campaignId/:urlId" component={RedirectPage} />
      <Route path="/r/bridge/:campaignId/:urlId" component={RedirectPage} />
      <Route path="/views/:customPath" component={RedirectPage} />
      <Route path="/c/:campaignId" component={RedirectPage} />
      <Route component={NotFound} />
    </Switch>
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
