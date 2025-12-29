import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MerchantProvider } from "@/context/MerchantContext";
import Layout from "@/components/Layout";
import DashboardPage from "@/pages/DashboardPage";
import RecoveriesPage from "@/pages/RecoveriesPage";
import GrowthPage from "@/pages/GrowthPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/recoveries" component={RecoveriesPage} />
        <Route path="/growth" component={GrowthPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MerchantProvider>
          <Toaster />
          <Router />
        </MerchantProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
