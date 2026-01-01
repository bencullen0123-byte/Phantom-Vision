import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Shield } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MoneyHero from "@/components/MoneyHero";
import ForensicCharts from "@/components/ForensicCharts";
import LeakageDonut from "@/components/charts/LeakageDonut";

function ConnectStripeGate() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-slate-900 border border-white/10 rounded-md p-12 max-w-xl">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-indigo-600/20 flex items-center justify-center">
          <Shield className="w-8 h-8 text-indigo-400" />
        </div>
        
        <h2 className="text-2xl font-semibold text-white mb-4">
          Connect Your Stripe Account
        </h2>
        
        <p className="text-slate-400 mb-6 leading-relaxed">
          PHANTOM needs access to your Stripe account to identify Ghost Users—customers 
          with active subscriptions but failed payments. Your data is encrypted with 
          AES-256-GCM and never leaves PHANTOM.
        </p>

        <Button 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 h-auto text-base font-medium"
          onClick={() => window.location.href = "/api/auth/stripe"}
          data-testid="button-connect-stripe"
        >
          <Shield className="w-4 h-4 mr-2" />
          Connect Stripe
        </Button>
      </div>
    </div>
  );
}

function DeepHarvestGate() {
  const { toast } = useToast();
  const { refetch } = useMerchant();

  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit/run", { forceSync: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Deep Harvest Complete",
        description: `Found ${data.total_ghosts_found} ghost users with ${data.total_revenue_at_risk_formatted} at risk.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Audit Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-slate-900 border border-white/10 rounded-md p-12 max-w-xl">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-indigo-600/20 flex items-center justify-center">
          <Search className="w-8 h-8 text-indigo-400" />
        </div>
        
        <h2 className="text-2xl font-semibold text-white mb-4">
          Initiate Deep Harvest
        </h2>
        
        <p className="text-slate-400 mb-6 leading-relaxed">
          PHANTOM's Recursive Forensic Audit will scan your entire Stripe history to identify 
          Ghost Users—customers with active subscriptions but failed payments. This all-time 
          scan reveals your true Shadow Revenue.
        </p>

        <div className="space-y-4">
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 h-auto text-base font-medium"
            onClick={() => auditMutation.mutate()}
            disabled={auditMutation.isPending}
            data-testid="button-initiate-harvest"
          >
            {auditMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Initiate Deep Harvest
              </>
            )}
          </Button>
          
          <p className="text-xs text-slate-500">
            Scans all invoices recursively. This may take several minutes.
          </p>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 text-slate-500 text-sm">
        <Shield className="w-4 h-4" />
        <span>AES-256-GCM encrypted. Your data never leaves PHANTOM.</span>
      </div>
    </div>
  );
}

function DashboardMetrics() {
  const { stats, isLoading } = useMerchantStats();

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MoneyHero />
        </div>
        <div className="lg:col-span-1">
          <LeakageDonut data={stats?.leakageDistribution} />
        </div>
      </div>
      <ForensicCharts />
    </div>
  );
}

export default function DashboardPage() {
  const { merchant, isLoading, isAuthenticated, authLoading } = useMerchant();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ConnectStripeGate />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!merchant || !merchant.lastAuditAt) {
    return <DeepHarvestGate />;
  }

  return <DashboardMetrics />;
}
