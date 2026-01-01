import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, Search, Shield, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import MonthlyTrendChart from "@/components/charts/MonthlyTrendChart";
import DailyPulseChart from "@/components/charts/DailyPulseChart";
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

function RefreshAuditButton() {
  const { refetch } = useMerchant();
  const { toast } = useToast();

  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit/run", { forceSync: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Audit Complete",
        description: `Found ${data.total_ghosts_found || 0} new issues identified.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ghosts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/logs"] });
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
    <Button
      variant="outline"
      size="sm"
      onClick={() => auditMutation.mutate()}
      disabled={auditMutation.isPending}
      className="border-white/10 text-slate-300"
      data-testid="button-refresh-audit"
    >
      {auditMutation.isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Hunting Ghosts...
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Audit
        </>
      )}
    </Button>
  );
}

function AutoPilotToggle() {
  const { merchant, refetch } = useMerchant();
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/merchant/branding", {
        autoPilotEnabled: enabled,
      });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      toast({
        title: enabled ? "Auto-Pilot Activated" : "Auto-Pilot Deactivated",
        description: enabled 
          ? "PHANTOM Sentinel will now automatically send recovery emails."
          : "Recovery emails require manual approval.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update Auto-Pilot",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!merchant) return null;

  const isEnabled = merchant.autoPilotEnabled;

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-2 rounded-md border transition-colors ${
        isEnabled 
          ? 'bg-emerald-950/50 border-emerald-500/30' 
          : 'bg-slate-800/50 border-white/10'
      }`}
    >
      <Zap className={`w-4 h-4 ${isEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
      <span className={`text-sm font-medium ${isEnabled ? 'text-emerald-300' : 'text-slate-400'}`}>
        {isEnabled ? 'Auto-Pilot ON' : 'Auto-Pilot OFF'}
      </span>
      <Switch
        checked={isEnabled}
        onCheckedChange={(checked) => toggleMutation.mutate(checked)}
        disabled={toggleMutation.isPending}
        data-testid="switch-auto-pilot"
        className="data-[state=checked]:bg-emerald-500"
      />
    </div>
  );
}

function MoneyHero() {
  const { merchant } = useMerchant();
  const { stats, isLoading: statsLoading } = useMerchantStats();

  if (!merchant) return null;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: stats?.defaultCurrency?.toUpperCase() || "GBP",
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

  const lifetime = stats?.lifetime || { allTimeLeakedCents: 0, totalRecoveredCents: 0, totalGhostCount: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-white">Revenue Intelligence</h1>
        <div className="flex items-center gap-3">
          <RefreshAuditButton />
          <AutoPilotToggle />
        </div>
      </div>
      <p className="text-slate-500 text-sm -mt-4">
        Last audit: <span className="font-mono text-slate-400">{formatDate(stats?.lastAuditAt || merchant.lastAuditAt)}</span>
      </p>

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
            {statsLoading ? "..." : formatCurrency(lifetime.allTimeLeakedCents - lifetime.totalRecoveredCents)}
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
            {statsLoading ? "..." : formatCurrency(lifetime.totalRecoveredCents)}
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
            {statsLoading ? "..." : lifetime.totalGhostCount}
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-500">Tier Limit</p>
          <p 
            className="text-xl text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {stats?.tierLimit || merchant.tierLimit}
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-500">Strategy</p>
          <p className="text-xl text-white capitalize">
            {stats?.recoveryStrategy || merchant.recoveryStrategy}
          </p>
        </div>
      </div>
    </div>
  );
}

function ForensicCharts() {
  const { stats, isLoading } = useMerchantStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-6 h-64 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-6 h-64 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-medium text-slate-300">Historical Trend</h3>
          <span className="text-xs text-slate-500">Monthly breakdown</span>
        </div>
        <MonthlyTrendChart data={stats.monthlyTrend} />
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-medium text-slate-300">30-Day Velocity</h3>
          <span className="text-xs text-slate-500">Daily activity</span>
        </div>
        <DailyPulseChart data={stats.dailyPulse} />
      </div>
    </div>
  );
}

function DashboardMetrics() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MoneyHero />
        </div>
        <div className="lg:col-span-1">
          <LeakageDonut />
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
