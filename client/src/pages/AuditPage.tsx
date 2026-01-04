import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { useMerchant } from "@/context/MerchantContext";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertTriangle, Sparkles, Clock } from "lucide-react";

function formatCurrency(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatGoldenHour(slot: string | null | undefined): string {
  if (!slot) return "Analyzing...";
  const parts = slot.split("_");
  if (parts.length !== 2) return slot;
  const [day, hour] = parts;
  const hourNum = parseInt(hour, 10);
  const period = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
  return `${day}s at ${hour12}${period}`;
}

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

  const lifetimeGrossVolume = stats.lifetimeGrossVolumeCents || 0;
  const leakageRatio = stats.leakageRatio || 0;
  const allTimeLeaked = stats.lifetime?.allTimeLeakedCents || 0;
  const projectedRecovery = Math.round(allTimeLeaked * 0.4);
  const goldenHour = stats.recommendedGoldenHour;
  const currency = stats.defaultCurrency || "usd";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-foreground mb-2">
            Revenue Integrity Report
          </h1>
          <p className="text-slate-400">
            A strategic audit of your payment health
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
              <p className="text-5xl font-mono font-bold text-white tracking-tight" data-testid="text-lifetime-volume">
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
                <h2 className="text-lg font-medium text-slate-300 mb-1">Act 2: Leakage</h2>
                <p className="text-sm text-slate-500">Revenue lost to failed payments and ghost users</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 py-4">
              <div className="text-center">
                <p className="text-5xl font-mono font-bold text-amber-400 tracking-tight" data-testid="text-leakage-ratio">
                  {leakageRatio.toFixed(2)}%
                </p>
                <p className="text-slate-400 mt-2 text-sm">Leakage Ratio</p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-mono font-bold text-red-400 tracking-tight" data-testid="text-total-leaked">
                  {formatCurrency(allTimeLeaked, currency)}
                </p>
                <p className="text-slate-400 mt-2 text-sm">Total Leaked</p>
              </div>
            </div>
          </Card>

          <Card className="p-8 bg-slate-900/50 border-white/10" data-testid="card-act-3-opportunity">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-300 mb-1">Act 3: Opportunity</h2>
                <p className="text-sm text-slate-500">Recoverable revenue and optimal engagement timing</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 py-4">
              <div className="text-center">
                <p className="text-5xl font-mono font-bold text-emerald-400 tracking-tight" data-testid="text-projected-recovery">
                  {formatCurrency(projectedRecovery, currency)}
                </p>
                <p className="text-slate-400 mt-2 text-sm">Projected Recovery (40%)</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-indigo-400" />
                </div>
                <p className="text-3xl font-mono font-bold text-indigo-300 tracking-tight" data-testid="text-golden-hour">
                  {formatGoldenHour(goldenHour)}
                </p>
                <p className="text-slate-400 mt-2 text-sm">Golden Hour</p>
              </div>
            </div>
          </Card>
        </div>

        <footer className="text-center mt-12 text-slate-500 text-sm">
          Last audit: {stats.lastAuditAt ? new Date(stats.lastAuditAt).toLocaleDateString() : "Never"}
        </footer>
      </div>
    </div>
  );
}

export default AuditPage;
