import { useMerchant } from "@/context/MerchantContext";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Terminal, Activity, Zap, CheckCircle, Info, Shield, AlertTriangle, TrendingUp, Target } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ForensicFunnel, parseDiagnosticMessage } from "@/components/ForensicFunnel";

interface IntelligenceLog {
  id: string;
  timestamp: string;
  type: "discovery" | "action" | "success" | "info";
  message: string;
  amount: number | null;
}

interface MerchantStats {
  id: string;
  lastAuditAt: string | null;
  tierLimit: number;
  recoveryStrategy: string;
  lifetime: {
    allTimeLeakedCents: number;
    totalGhostCount: number;
    totalRecoveredCents: number;
  };
  defaultCurrency: string;
  impendingLeakageCents: number;
  totalProtectedCents: number;
  monthlyTrend: Array<{ month: string; leaked: number; recovered: number }>;
  dailyPulse: Array<{ date: string; leaked: number; recovered: number }>;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  gbp: "\u00a3",
  usd: "$",
  eur: "\u20ac",
  cad: "C$",
  aud: "A$",
  jpy: "\u00a5",
};

function formatCurrency(cents: number, currency: string = "gbp"): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()] || "\u00a3";
  const amount = (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${amount}`;
}


function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getLogIcon(type: IntelligenceLog["type"]) {
  switch (type) {
    case "discovery":
      return <Activity className="w-3 h-3" />;
    case "action":
      return <Zap className="w-3 h-3" />;
    case "success":
      return <CheckCircle className="w-3 h-3" />;
    case "info":
      return <Info className="w-3 h-3" />;
  }
}

function getLogColorClass(type: IntelligenceLog["type"]): string {
  switch (type) {
    case "discovery":
      return "text-slate-500";
    case "action":
      return "text-sky-400";
    case "success":
      return "text-emerald-500";
    case "info":
      return "text-sky-400";
  }
}

function LogEntrySkeleton() {
  return (
    <div className="flex items-start gap-3 py-2 px-3">
      <div className="w-3 h-3 mt-1 rounded-full bg-slate-800 animate-slow-pulse" />
      <div className="flex-1 space-y-1">
        <div className="h-3 w-32 bg-slate-800 rounded animate-slow-pulse" />
        <div className="h-4 w-full max-w-md bg-slate-800 rounded animate-slow-pulse" />
      </div>
    </div>
  );
}

function IntelligenceLogFeed() {
  const logsQuery = useQuery<IntelligenceLog[]>({
    queryKey: ["/api/merchant/logs"],
  });

  if (logsQuery.isLoading) {
    return (
      <div className="min-h-[400px] bg-slate-950 border border-white/5 rounded-md overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/50">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            system.log
          </span>
        </div>
        <div className="divide-y divide-white/[0.02]">
          {[...Array(8)].map((_, i) => (
            <LogEntrySkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (logsQuery.error) {
    return (
      <div className="min-h-[400px] bg-slate-950 border border-white/5 rounded-md flex items-center justify-center">
        <p className="text-red-400">Failed to load intelligence logs</p>
      </div>
    );
  }

  if (!logsQuery.data || logsQuery.data.length === 0) {
    return (
      <div className="min-h-[400px] bg-slate-950 border border-white/5 rounded-md overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/50">
          <Terminal className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            system.log
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Terminal className="w-10 h-10 text-slate-700 mb-4" />
          <p className="text-slate-500">No system activity recorded yet.</p>
          <p className="text-sm text-slate-600 mt-2">Run a Deep Harvest audit to see intelligence logs.</p>
        </div>
      </div>
    );
  }

  const diagnosticLog = logsQuery.data.find(log => log.message.startsWith('Diagnostic:'));
  const funnelData = diagnosticLog ? parseDiagnosticMessage(diagnosticLog.message) : null;

  return (
    <div className="space-y-4">
      <ForensicFunnel data={funnelData} />
      
      <div className="min-h-[400px] bg-slate-950 border border-white/5 rounded-md overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/5 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              intelligence.log
            </span>
          </div>
          <span className="text-xs text-slate-600" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            {logsQuery.data.length} entries
          </span>
        </div>
        
        <div 
          className="max-h-[500px] overflow-y-auto divide-y divide-white/[0.02]"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {logsQuery.data.map((log) => (
          <div 
            key={log.id}
            className="flex items-start gap-3 py-2 px-4 hover:bg-white/[0.02] transition-colors"
            data-testid={`log-entry-${log.id}`}
          >
            <span className={`mt-0.5 ${getLogColorClass(log.type)}`}>
              {getLogIcon(log.type)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 mb-0.5">
                <span className="text-[10px] text-slate-600">
                  {formatTimestamp(log.timestamp)}
                </span>
                {log.amount && (
                  <span className={`text-xs ${log.type === "success" ? "text-emerald-500" : "text-slate-400"}`}>
                    {formatCurrency(log.amount)}
                  </span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${getLogColorClass(log.type)}`}>
                {log.message}
              </p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function CFOHeadline({ stats }: { stats: MerchantStats }) {
  const currency = stats.defaultCurrency;
  
  const revenueGuarded = stats.lifetime.totalRecoveredCents + stats.totalProtectedCents;
  const shadowLeakage = stats.lifetime.allTimeLeakedCents;
  const impendingRisk = stats.impendingLeakageCents;
  
  const totalExposure = revenueGuarded + shadowLeakage;
  const integrityScore = totalExposure > 0 
    ? Math.round((revenueGuarded / totalExposure) * 100) 
    : 100;
  
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="cfo-headline">
      <Card className="bg-slate-900 border-emerald-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-slate-400 uppercase tracking-wide">Revenue Guarded</span>
        </div>
        <div 
          className="text-2xl font-semibold text-emerald-400"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
          data-testid="kpi-revenue-guarded"
        >
          {formatCurrency(revenueGuarded, currency)}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Protected + Recovered</p>
      </Card>
      
      <Card className="bg-slate-900 border-amber-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-slate-400 uppercase tracking-wide">Shadow Leakage</span>
        </div>
        <div 
          className="text-2xl font-semibold text-amber-400"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
          data-testid="kpi-shadow-leakage"
        >
          {formatCurrency(shadowLeakage, currency)}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">{stats.lifetime.totalGhostCount} ghost users</p>
      </Card>
      
      <Card className="bg-slate-900 border-red-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-red-400" />
          <span className="text-xs text-slate-400 uppercase tracking-wide">Impending Risk</span>
        </div>
        <div 
          className="text-2xl font-semibold text-red-400"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
          data-testid="kpi-impending-risk"
        >
          {formatCurrency(impendingRisk, currency)}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Expiring cards detected</p>
      </Card>
      
      <Card className="bg-slate-900 border-sky-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-sky-400" />
          <span className="text-xs text-slate-400 uppercase tracking-wide">Integrity Score</span>
        </div>
        <div 
          className={`text-2xl font-semibold ${integrityScore >= 80 ? 'text-emerald-400' : integrityScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}
          style={{ fontFamily: "JetBrains Mono, monospace" }}
          data-testid="kpi-integrity-score"
        >
          {integrityScore}%
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Guarded / Total Exposure</p>
      </Card>
    </div>
  );
}

export default function SystemPage() {
  const { isAuthenticated, authLoading } = useMerchant();
  
  const statsQuery = useQuery<MerchantStats>({
    queryKey: ["/api/merchant/stats"],
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 mb-4">Please connect your Stripe account to view system logs.</p>
        <Link href="/">
          <Button variant="outline" className="border-white/10" data-testid="link-dashboard">
            Go to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Financial Command Center</h1>
        <p className="text-slate-400">Real-time revenue intelligence and recovery metrics.</p>
      </div>

      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-white/5 p-4 animate-slow-pulse">
              <div className="h-4 w-24 bg-slate-800 rounded mb-3" />
              <div className="h-8 w-32 bg-slate-800 rounded" />
            </Card>
          ))}
        </div>
      ) : statsQuery.data ? (
        <CFOHeadline stats={statsQuery.data} />
      ) : null}

      <IntelligenceLogFeed />
    </div>
  );
}
