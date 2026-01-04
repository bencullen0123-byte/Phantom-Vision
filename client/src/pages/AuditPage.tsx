import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { useMerchant } from "@/context/MerchantContext";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, TrendingUp, AlertTriangle, Shield } from "lucide-react";

function AuditPage() {
  const { merchant, isAuthenticated } = useMerchant();
  const { stats, isLoading, isError } = useMerchantStats();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-400">
          <p>Connect your Stripe account to view your audit report.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-red-400">
          <p>Failed to load audit data.</p>
        </div>
      </div>
    );
  }

  const currency = stats.defaultCurrency;
  const lifetimeGrossVolume = stats.lifetimeGrossVolumeCents || 0;
  const allTimeLeaked = stats.lifetime?.allTimeLeakedCents || 0;
  const leakageRatio = lifetimeGrossVolume > 0 ? (allTimeLeaked / lifetimeGrossVolume) * 100 : 0;
  const projectedRecovery = Math.round(allTimeLeaked * 0.4);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Revenue Integrity Report
          </h1>
          <p className="text-slate-400">
            {merchant?.businessName ? `Financial audit for ${merchant.businessName}` : "A strategic audit of your payment health"}
          </p>
        </header>

        <div className="grid gap-8">
          <Card className="p-8 bg-slate-900/50 border-white/10" data-testid="card-act-1-scale">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-indigo-600/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-300 mb-1">Act 1: Scale</h2>
                <p className="text-sm text-slate-500">Total revenue processed through your payment infrastructure</p>
              </div>
            </div>
            <div className="text-center py-4">
              <p 
                className="text-5xl font-bold text-white tracking-tight" 
                style={{ fontFamily: "JetBrains Mono, monospace" }}
                data-testid="text-lifetime-volume"
              >
                {formatCurrency(lifetimeGrossVolume, currency)}
              </p>
              <p className="text-slate-400 mt-2 text-sm">Lifetime Processed Volume</p>
            </div>
          </Card>

          <Card className="p-8 bg-slate-900/50 border-white/10" data-testid="card-act-2-leakage">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-amber-600/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-300 mb-1">Act 2: The Loss</h2>
                <p className="text-sm text-slate-500">Revenue lost to failed payments and ghost users</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 py-4">
              <div className="text-center">
                <p 
                  className="text-5xl font-bold text-amber-400 tracking-tight" 
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  data-testid="text-leakage-ratio"
                >
                  {leakageRatio.toFixed(2)}%
                </p>
                <p className="text-slate-400 mt-2 text-sm">Leakage Ratio</p>
              </div>
              <div className="text-center">
                <p 
                  className="text-5xl font-bold text-red-400 tracking-tight" 
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                  data-testid="text-total-leaked"
                >
                  {formatCurrency(allTimeLeaked, currency)}
                </p>
                <p className="text-slate-400 mt-2 text-sm">Total Leaked</p>
              </div>
            </div>
          </Card>

          <Card className="p-8 bg-emerald-950/30 border-emerald-500/20" data-testid="card-act-3-prize">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-emerald-300 mb-1">Act 3: The Prize</h2>
                <p className="text-sm text-slate-500">Recoverable revenue awaiting action</p>
              </div>
            </div>
            <div className="text-center py-6">
              <p 
                className="text-6xl font-bold text-emerald-400 tracking-tight" 
                style={{ 
                  fontFamily: "JetBrains Mono, monospace",
                  textShadow: "0 0 20px rgba(16, 185, 129, 0.3)"
                }}
                data-testid="text-projected-recovery"
              >
                {formatCurrency(projectedRecovery, currency)}
              </p>
              <p className="text-slate-400 mt-3 text-sm">Projected Recovery</p>
              <p className="text-emerald-500/70 text-xs mt-1">Based on 40% industry recovery benchmark</p>
            </div>
          </Card>
        </div>

        <footer className="text-center mt-12 space-y-4">
          <p className="text-slate-500 text-sm">
            Last audit: {stats.lastAuditAt ? new Date(stats.lastAuditAt).toLocaleDateString() : "Pending"}
          </p>
          <Link href="/">
            <Button variant="outline" className="border-white/10 text-slate-300" data-testid="button-return-dashboard">
              Return to Dashboard
            </Button>
          </Link>
        </footer>
      </div>
    </div>
  );
}

export default AuditPage;
