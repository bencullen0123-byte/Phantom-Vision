import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Loader2, Shield, Activity } from "lucide-react";
import MonthlyTrendChart from "@/components/charts/MonthlyTrendChart";
import GuardianAreaChart from "@/components/charts/GuardianAreaChart";

export default function ForensicCharts() {
  const { stats, isLoading } = useMerchantStats();

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-6 h-80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-6 h-80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      </div>
    );
  }

  const currency = stats.defaultCurrency || "usd";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-medium text-slate-300">Guardian Shield</h3>
          </div>
          <span className="text-xs text-slate-500">30-Day Protection Velocity</span>
        </div>
        <GuardianAreaChart 
          data={stats.dailyPulse} 
          grossInvoicedCents={stats.grossInvoicedCents || 0}
          currency={currency} 
        />
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-slate-300">Historical Trend</h3>
          </div>
          <span className="text-xs text-slate-500">Monthly breakdown</span>
        </div>
        <MonthlyTrendChart data={stats.monthlyTrend} currency={currency} />
      </div>
    </div>
  );
}
