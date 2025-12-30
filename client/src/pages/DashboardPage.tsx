import { useMerchant } from "@/context/MerchantContext";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Shield, TrendingDown, TrendingUp } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MonthlyTrendChart from "@/components/charts/MonthlyTrendChart";
import DailyPulseChart from "@/components/charts/DailyPulseChart";

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

function MoneyHero() {
  const { merchant } = useMerchant();

  if (!merchant) return null;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-white">Revenue Intelligence</h1>
        <p className="text-slate-500 text-sm">
          Last audit: <span className="font-mono text-slate-400">{formatDate(merchant.lastAuditAt)}</span>
        </p>
      </div>

      <div className="h-[200px] flex flex-col items-center justify-center text-center space-y-4">
        <div>
          <p className="text-slate-500 text-sm mb-2 flex items-center justify-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Money Left on the Table
          </p>
          <p 
            className="text-5xl md:text-6xl lg:text-7xl text-slate-400"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-leaked-hero"
          >
            {formatCurrency(merchant.lifetime.allTimeLeakedCents)}
          </p>
        </div>

        <div className="pt-4">
          <p className="text-slate-500 text-sm mb-2 flex items-center justify-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Recovered by PHANTOM
          </p>
          <p 
            className="text-3xl md:text-4xl text-emerald-500"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-recovered-hero"
          >
            {formatCurrency(merchant.lifetime.totalRecoveredCents)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 text-sm border-t border-white/5 pt-6">
        <div className="text-center">
          <p className="text-slate-500">Ghost Users</p>
          <p 
            className="text-xl text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-ghost-count"
          >
            {merchant.lifetime.totalGhostCount}
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-500">Tier Limit</p>
          <p 
            className="text-xl text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {merchant.tierLimit}
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-500">Strategy</p>
          <p className="text-xl text-white capitalize">
            {merchant.recoveryStrategy}
          </p>
        </div>
      </div>
    </div>
  );
}

function ForensicCharts() {
  const { merchant } = useMerchant();

  if (!merchant) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-medium text-slate-300">Historical Trend</h3>
          <span className="text-xs text-slate-500">Monthly breakdown</span>
        </div>
        <MonthlyTrendChart data={merchant.monthlyTrend} />
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-medium text-slate-300">30-Day Velocity</h3>
          <span className="text-xs text-slate-500">Daily activity</span>
        </div>
        <DailyPulseChart data={merchant.dailyPulse} />
      </div>
    </div>
  );
}

function DashboardMetrics() {
  return (
    <div className="space-y-8">
      <MoneyHero />
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
