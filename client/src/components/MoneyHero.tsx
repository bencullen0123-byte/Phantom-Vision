import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, TrendingDown, TrendingUp, Zap, Activity } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function MoneyHero() {
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
  const grossInvoiced = stats?.grossInvoicedCents || 0;
  
  const netLeakage = lifetime.allTimeLeakedCents - lifetime.totalRecoveredCents;
  const leakageRate = grossInvoiced > 0 ? (netLeakage / grossInvoiced) * 100 : 0;
  
  const getHealthStatus = (rate: number) => {
    if (rate < 5) return { label: "Healthy", color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" };
    if (rate <= 10) return { label: "Warning", color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30" };
    return { label: "Critical", color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30" };
  };
  
  const healthStatus = getHealthStatus(leakageRate);

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
            {statsLoading ? "..." : formatCurrency(netLeakage)}
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

      <div className="flex items-center justify-center gap-6 text-sm border-t border-white/5 pt-6 flex-wrap">
        <div 
          className={`flex items-center gap-2 px-4 py-2 rounded-md border ${healthStatus.bg} ${healthStatus.border}`}
          data-testid="badge-leakage-rate"
        >
          <Activity className={`w-4 h-4 ${healthStatus.color}`} />
          <div className="text-left">
            <p className="text-slate-400 text-xs">Leakage Rate</p>
            <p className={`text-lg font-semibold ${healthStatus.color}`} style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {statsLoading ? "..." : `${leakageRate.toFixed(1)}%`}
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${healthStatus.bg} ${healthStatus.color}`}>
            {healthStatus.label}
          </span>
        </div>

        <div className="text-center">
          <p className="text-slate-500 text-xs">Total Invoiced Volume</p>
          <p 
            className="text-lg text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-gross-invoiced"
          >
            {statsLoading ? "..." : formatCurrency(grossInvoiced)}
          </p>
        </div>

        <div className="text-center">
          <p className="text-slate-500 text-xs">Ghost Users</p>
          <p 
            className="text-lg text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-ghost-count"
          >
            {statsLoading ? "..." : lifetime.totalGhostCount}
          </p>
        </div>

        <div className="text-center">
          <p className="text-slate-500 text-xs">Tier Limit</p>
          <p 
            className="text-lg text-white"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {stats?.tierLimit || merchant.tierLimit}
          </p>
        </div>

        <div className="text-center">
          <p className="text-slate-500 text-xs">Strategy</p>
          <p className="text-lg text-white capitalize">
            {stats?.recoveryStrategy || merchant.recoveryStrategy}
          </p>
        </div>
      </div>
    </div>
  );
}
