import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Loader2 } from "lucide-react";
import MonthlyTrendChart from "@/components/charts/MonthlyTrendChart";
import DailyPulseChart from "@/components/charts/DailyPulseChart";

export default function ForensicCharts() {
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
