import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Loader2, Shield, Activity, Eye } from "lucide-react";
import MonthlyTrendChart from "@/components/charts/MonthlyTrendChart";
import GuardianAreaChart from "@/components/charts/GuardianAreaChart";

export default function ForensicCharts() {
  const { stats, isLoading } = useMerchantStats();

  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-medium text-slate-400">Vigilance Grid</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/50 border border-white/5 rounded-md p-4 h-64 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-md p-4 h-64 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        </div>
      </div>
    );
  }

  const currency = stats.defaultCurrency || "eur";
  const hasData = (stats.dailyPulse && stats.dailyPulse.length > 0) || 
                  (stats.monthlyTrend && stats.monthlyTrend.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-medium text-slate-300">Vigilance Grid</h3>
        <span className="text-xs text-slate-500 ml-auto">Sentinel monitoring metrics</span>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 border border-white/5 rounded-md p-4">
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-medium text-slate-400">Guardian Shield</h4>
            </div>
            <span className="text-xs text-slate-500">30-Day Protection Velocity</span>
          </div>
          {stats.dailyPulse && stats.dailyPulse.length > 0 ? (
            <GuardianAreaChart 
              data={stats.dailyPulse} 
              grossInvoicedCents={stats.grossInvoicedCents || 0}
              currency={currency} 
            />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500">
              <Shield className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm">No protection data yet</p>
              <p className="text-xs mt-1">Shield activates after first recovery</p>
            </div>
          )}
        </div>

        <div className="bg-slate-900/50 border border-white/5 rounded-md p-4">
          <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-medium text-slate-400">Historical Trend</h4>
            </div>
            <span className="text-xs text-slate-500">Monthly breakdown</span>
          </div>
          {stats.monthlyTrend && stats.monthlyTrend.length > 0 ? (
            <MonthlyTrendChart data={stats.monthlyTrend} currency={currency} />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500">
              <Activity className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm">No trend data yet</p>
              <p className="text-xs mt-1">History builds over time</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
