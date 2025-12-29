import { useMerchant } from "@/context/MerchantContext";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Shield } from "lucide-react";

function DeepHarvestGate() {
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
            data-testid="button-initiate-harvest"
          >
            <Search className="w-4 h-4 mr-2" />
            Initiate Deep Harvest
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
  const { merchant } = useMerchant();

  if (!merchant) return null;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Revenue Intelligence</h1>
        <p className="text-slate-400">
          Last audit: <span className="font-mono">{formatDate(merchant.lastAuditAt)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-white/10 rounded-md p-6">
          <p className="text-slate-400 text-sm mb-2">Recovered Revenue</p>
          <p 
            className="font-mono text-3xl text-emerald-500"
            data-testid="text-recovered-total"
          >
            {formatCurrency(merchant.totalRecoveredCents)}
          </p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-md p-6">
          <p className="text-slate-400 text-sm mb-2">Shadow Revenue (Leaked)</p>
          <p 
            className="font-mono text-3xl text-slate-400"
            data-testid="text-leaked-total"
          >
            {formatCurrency(merchant.allTimeLeakedCents)}
          </p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-md p-6">
          <p className="text-slate-400 text-sm mb-2">Ghost Users Detected</p>
          <p 
            className="font-mono text-3xl text-white"
            data-testid="text-ghost-count"
          >
            {merchant.totalGhostCount}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { merchant, isLoading, error } = useMerchant();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400">Unable to load merchant data. Please connect your Stripe account.</p>
        <Button 
          className="mt-4 bg-indigo-600 hover:bg-indigo-700"
          onClick={() => window.location.href = "/api/auth/stripe"}
          data-testid="button-connect-stripe"
        >
          Connect Stripe
        </Button>
      </div>
    );
  }

  if (!merchant || !merchant.lastAuditAt) {
    return <DeepHarvestGate />;
  }

  return <DashboardMetrics />;
}
