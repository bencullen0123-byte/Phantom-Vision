import { useMerchant } from "@/context/MerchantContext";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Terminal, Activity, Zap, CheckCircle, Info } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface IntelligenceLog {
  id: string;
  timestamp: string;
  type: "discovery" | "action" | "success" | "info";
  message: string;
  amount: number | null;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(cents / 100);
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
      return "text-slate-500";
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

  return (
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
  );
}

export default function SystemPage() {
  const { isAuthenticated, authLoading } = useMerchant();

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
        <h1 className="text-2xl font-semibold text-white mb-2">System Intelligence</h1>
        <p className="text-slate-400">Decision transparency feed showing automated recovery logic.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-4">
          <div className="flex items-center justify-center gap-2 text-sky-400 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Action</span>
          </div>
          <p className="text-[10px] text-slate-500">Recovery strategy decisions</p>
        </div>
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-4">
          <div className="flex items-center justify-center gap-2 text-slate-500 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Discovery</span>
          </div>
          <p className="text-[10px] text-slate-500">Ghost user identification</p>
        </div>
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-4">
          <div className="flex items-center justify-center gap-2 text-emerald-500 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide">Success</span>
          </div>
          <p className="text-[10px] text-slate-500">Confirmed recoveries</p>
        </div>
      </div>

      <IntelligenceLogFeed />
    </div>
  );
}
