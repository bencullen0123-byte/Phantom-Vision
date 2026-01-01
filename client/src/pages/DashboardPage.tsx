import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Shield, TrendingUp, Ghost, Mail, MousePointer, CheckCircle, FileText, RefreshCw, Clock } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ForensicCharts from "@/components/ForensicCharts";
import DiagnosticTrident from "@/components/DiagnosticTrident";

interface DiagnosticPulse {
  totalInvoicesScanned: number;
  requires3dsCount: number;
  cardBrandDistribution: Record<string, number>;
  lastScanAt: string | null;
  lastScanStatus: string | null;
}

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
      return { data: await res.json(), status: res.status };
    },
    onSuccess: ({ data, status }) => {
      if (status === 202) {
        toast({
          title: "Deep Harvest Initiated",
          description: "Scanning in background. Results will appear shortly.",
        });
        // Poll for completion by refetching stats
        const pollInterval = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
          refetch();
        }, 3000);
        // Stop polling after 2 minutes max
        setTimeout(() => clearInterval(pollInterval), 120000);
      } else {
        toast({
          title: "Deep Harvest Complete",
          description: `Found ${data.total_ghosts_found} ghost users with ${data.total_revenue_at_risk_formatted} at risk.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
        refetch();
      }
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

function ConversionFunnel({ funnel, recoveryRate, auditedCount }: { 
  funnel?: { totalGhosts: number; nudgedCount: number; clickedCount: number; recoveredCount: number };
  recoveryRate?: number;
  auditedCount?: number;
}) {
  const steps = [
    { 
      label: "Audited", 
      value: auditedCount || 0, 
      icon: FileText, 
      color: "text-indigo-400",
      bg: "bg-indigo-500/20"
    },
    { 
      label: "Ghosts Detected", 
      value: funnel?.totalGhosts || 0, 
      icon: Ghost, 
      color: "text-slate-400",
      bg: "bg-slate-500/20"
    },
    { 
      label: "Nudges Sent", 
      value: funnel?.nudgedCount || 0, 
      icon: Mail, 
      color: "text-blue-400",
      bg: "bg-blue-500/20"
    },
    { 
      label: "Link Clicks", 
      value: funnel?.clickedCount || 0, 
      icon: MousePointer, 
      color: "text-amber-400",
      bg: "bg-amber-500/20"
    },
    { 
      label: "Recovered", 
      value: funnel?.recoveredCount || 0, 
      icon: CheckCircle, 
      color: "text-emerald-400",
      bg: "bg-emerald-500/20"
    },
  ];

  return (
    <Card className="bg-slate-900/50 border-white/5 p-4">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-slate-300">Audit Proof</h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">
            {auditedCount?.toLocaleString() || 0} Invoices Audited
          </span>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-slate-400">
              Conversion: <span className="text-emerald-400 font-semibold">{(recoveryRate || 0).toFixed(1)}%</span>
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="flex items-center flex-1">
            <div className="flex flex-col items-center text-center flex-1">
              <div className={`w-10 h-10 rounded-full ${step.bg} flex items-center justify-center mb-1`}>
                <step.icon className={`w-4 h-4 ${step.color}`} />
              </div>
              <span className="text-xl font-bold text-white" data-testid={`text-funnel-${step.label.toLowerCase().replace(' ', '-')}`}>
                {step.value.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="w-6 h-px bg-white/10 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RevenueSavedCard({ amount, currency }: { amount: number; currency: string }) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency?.toUpperCase() || "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <Card className="bg-emerald-950/40 border-emerald-500/30 p-6 relative overflow-visible">
      <div className="absolute -top-3 -right-3 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl" />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        </div>
        <span className="text-sm font-medium text-emerald-300">Revenue Saved</span>
      </div>
      <p 
        className="text-3xl font-bold text-emerald-400"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
        data-testid="text-revenue-saved"
      >
        {formatCurrency(amount)}
      </p>
      <p className="text-xs text-emerald-500/70 mt-2">
        Recovered through PHANTOM outreach
      </p>
    </Card>
  );
}

function CommandHeader() {
  const { merchant } = useMerchant();
  const { stats, refetch: refetchStats } = useMerchantStats();
  const { toast } = useToast();

  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit/run", { forceSync: true });
      return { data: await res.json(), status: res.status };
    },
    onSuccess: ({ data, status }) => {
      if (status === 202) {
        toast({
          title: "Audit Initiated",
          description: "Scanning in background...",
        });
      } else {
        toast({
          title: "Audit Complete",
          description: `Found ${data.total_ghosts_found} ghosts.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      refetchStats();
    },
    onError: (error: Error) => {
      toast({
        title: "Audit Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isArmed = merchant?.autoPilotEnabled || false;
  const volumeGuarded = stats?.grossInvoicedCents || 0;
  const activeLeakage = stats?.lifetime?.allTimeLeakedCents || 0;
  const revenueSaved = (stats?.lifetime?.totalRecoveredCents || 0) + (stats?.totalProtectedCents || 0);
  const lastAudit = stats?.lastAuditAt;

  return (
    <div className="flex flex-wrap items-center justify-between gap-8 py-3 px-6 border-b border-white/10 bg-slate-900/50 -mx-6 -mt-6 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <Shield className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <p 
            className="text-lg font-bold text-white tabular-nums"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-volume-guarded"
          >
            {formatEuro(volumeGuarded)}
          </p>
          <p className="text-xs text-slate-500">Volume Guarded</p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isArmed ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
          <span className={`text-sm font-medium ${isArmed ? "text-emerald-400" : "text-slate-400"}`} data-testid="text-sentinel-status">
            {isArmed ? "Sentinel Active" : "Sentinel Standby"}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span 
            className="text-sm font-bold text-red-400/80 tabular-nums"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-active-leakage"
          >
            {formatEuro(activeLeakage)}
          </span>
          <span className="text-xs text-slate-500">Active Leakage</span>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 text-slate-300"
          onClick={() => auditMutation.mutate()}
          disabled={auditMutation.isPending}
          data-testid="button-refresh-audit"
        >
          {auditMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="hidden sm:inline ml-2">Refresh</span>
        </Button>
      </div>

      <div className="flex items-center gap-8">
        <div className="text-right">
          <p 
            className="text-lg font-bold text-emerald-400 tabular-nums"
            style={{ 
              fontFamily: "JetBrains Mono, monospace",
              textShadow: "0 0 8px rgba(16, 185, 129, 0.3)"
            }}
            data-testid="text-command-revenue-saved"
          >
            {formatEuro(revenueSaved)}
          </p>
          <p className="text-xs text-emerald-500/70">Revenue Saved</p>
        </div>
        
        <div className="text-right">
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3" />
            <p className="text-sm font-medium tabular-nums" data-testid="text-last-audit">
              {formatRelativeTime(lastAudit || null)}
            </p>
          </div>
          <p className="text-xs text-slate-500">Last Audit</p>
        </div>
      </div>
    </div>
  );
}

function DashboardMetrics() {
  const { stats, isLoading } = useMerchantStats();
  
  // Fetch diagnostic pulse for "Audited" count
  const { data: diagnosticPulse } = useQuery<DiagnosticPulse>({
    queryKey: ["/api/diagnostic-pulse"],
  });
  
  const totalRecoveredCents = stats?.lifetime?.totalRecoveredCents || 0;
  const totalProtectedCents = stats?.totalProtectedCents || 0;
  const revenueSaved = totalRecoveredCents + totalProtectedCents;

  return (
    <div className="space-y-6">
      <CommandHeader />
      
      <DiagnosticTrident />
      
      <ConversionFunnel 
        funnel={stats?.funnel} 
        recoveryRate={stats?.recoveryRate} 
        auditedCount={diagnosticPulse?.totalInvoicesScanned}
      />
      
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
