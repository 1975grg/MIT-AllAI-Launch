import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import StudentRequest from "@/pages/student-request";
import StudentTracking from "@/pages/student-tracking";
import Dashboard from "@/pages/dashboard";
import Properties from "@/pages/properties";
import Entities from "@/pages/entities";
import EntityPerformance from "@/pages/entity-performance";
import PropertyPerformance from "@/pages/property-performance";
import Tenants from "@/pages/tenants";
import Maintenance from "@/pages/maintenance";
import Expenses from "@/pages/expenses";
import Vendors from "@/pages/vendors";
import Revenue from "@/pages/revenue";
import Tax from "@/pages/tax";
import Reminders from "@/pages/reminders";
import ContractorDashboard from "@/pages/contractor-dashboard";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Public routes accessible to everyone */}
      <Route path="/student-request" component={StudentRequest} />
      <Route path="/student-tracking" component={StudentTracking} />
      
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route component={Landing} />
        </>
      ) : (
        <>
          <Route path="/" component={Dashboard} />
          <Route path="/properties" component={Properties} />
          <Route path="/properties/:id/performance" component={PropertyPerformance} />
          <Route path="/entities" component={Entities} />
          <Route path="/entities/:id/performance" component={EntityPerformance} />
          <Route path="/tenants" component={Tenants} />
          <Route path="/maintenance" component={Maintenance} />
          <Route path="/vendors" component={Vendors} />
          <Route path="/expenses" component={Expenses} />
          <Route path="/revenue" component={Revenue} />
          <Route path="/tax" component={Tax} />
          <Route path="/reminders" component={Reminders} />
          <Route path="/contractor" component={ContractorDashboard} />
          <Route component={NotFound} />
        </>
      )}
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
