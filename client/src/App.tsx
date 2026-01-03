import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { SignedIn, SignedOut, RedirectToSignIn, useAuth } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MerchantProvider, useMerchant } from "@/context/MerchantContext";
import MainLayout from "@/components/layout/MainLayout";
import ObsidianSkeleton from "@/components/ObsidianSkeleton";
import DashboardPage from "@/pages/DashboardPage";
import RecoveriesPage from "@/pages/RecoveriesPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/not-found";

function ProtectedRouter() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/recoveries" component={RecoveriesPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function AppContent() {
  const { authLoading } = useMerchant();
  const { isLoaded: clerkLoaded } = useAuth();

  if (!clerkLoaded || authLoading) {
    return <ObsidianSkeleton />;
  }

  return (
    <>
      <SignedIn>
        <ProtectedRouter />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MerchantProvider>
          <Toaster />
          <AppContent />
        </MerchantProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
