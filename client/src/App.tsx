import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Properties from "@/pages/properties";
import Entities from "@/pages/entities";
import EntityPerformance from "@/pages/entity-performance";
import Tenants from "@/pages/tenants";
import Maintenance from "@/pages/maintenance";
import Expenses from "@/pages/expenses";
import Reminders from "@/pages/reminders";
import Leases from "@/pages/leases";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/properties" component={Properties} />
          <Route path="/entities" component={Entities} />
          <Route path="/entities/:id/performance" component={EntityPerformance} />
          <Route path="/tenants" component={Tenants} />
          <Route path="/leases" component={Leases} />
          <Route path="/maintenance" component={Maintenance} />
          <Route path="/expenses" component={Expenses} />
          <Route path="/reminders" component={Reminders} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
