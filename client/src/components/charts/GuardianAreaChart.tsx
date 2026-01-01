import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, TooltipProps } from "recharts";
import type { DailyPulsePoint } from "@/context/MerchantContext";
import { Shield, AlertTriangle } from "lucide-react";

interface GuardianAreaChartProps {
  data: DailyPulsePoint[];
  grossInvoicedCents: number;
  currency?: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    gbp: "£",
    usd: "$",
    eur: "€",
    aud: "A$",
    cad: "C$",
    jpy: "¥",
  };
  return symbols[currency.toLowerCase()] || currency.toUpperCase() + " ";
}

function formatCurrency(cents: number, currency: string = "gbp"): string {
  const symbol = getCurrencySymbol(currency);
  const value = Math.abs(cents / 100);
  if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}k`;
  }
  return `${symbol}${Math.round(value)}`;
}

function formatCurrencyFull(cents: number, currency: string = "gbp"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function sortChronologically(data: DailyPulsePoint[]): DailyPulsePoint[] {
  return [...data].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  currency: string;
  dailyGuarded: number;
}

function CustomTooltip({ active, payload, label, currency, dailyGuarded }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const leakedValue = payload.find(p => p.dataKey === "leaked")?.value || 0;
  const guardedValue = dailyGuarded;

  return (
    <div className="bg-slate-900 border border-white/10 rounded-md p-3 shadow-lg" style={{ fontFamily: "JetBrains Mono" }}>
      <p className="text-xs text-slate-400 mb-2">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3 text-indigo-400" />
          <span className="text-xs text-slate-500">Daily Volume:</span>
          <span className="text-xs text-indigo-300 font-medium">{formatCurrencyFull(guardedValue, currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span className="text-xs text-slate-500">Detected Leakage:</span>
          <span className="text-xs text-amber-300 font-medium">{formatCurrencyFull(leakedValue as number, currency)}</span>
        </div>
      </div>
    </div>
  );
}

export default function GuardianAreaChart({ data, grossInvoicedCents, currency = "gbp" }: GuardianAreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex flex-col items-center justify-center text-center bg-slate-900/30 border border-white/5 rounded-md">
        <Shield className="w-10 h-10 text-indigo-400/50 mb-3" />
        <p className="text-sm text-slate-400">Monitoring Initiated</p>
        <p className="text-xs text-slate-600 mt-1">Protection data will appear after the first audit cycle</p>
      </div>
    );
  }

  const sortedData = sortChronologically(data);
  
  const dailyGuarded = sortedData.length > 0 
    ? Math.round(grossInvoicedCents / 30) 
    : 0;

  const chartData = sortedData.map(d => ({
    ...d,
    label: formatDate(d.date),
    guarded: dailyGuarded,
  }));

  const maxLeaked = Math.max(...sortedData.map(d => d.leaked || 0));
  const yAxisMax = Math.max(dailyGuarded, maxLeaked) * 1.2;

  return (
    <div className="h-[280px]" data-testid="chart-guardian-area">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="guardianShieldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="guardianSpikeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis 
            dataKey="label" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }}
            interval="preserveStartEnd"
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickFormatter={(v) => formatCurrency(v, currency)}
            width={60}
            domain={[0, yAxisMax]}
          />
          <Tooltip
            content={<CustomTooltip currency={currency} dailyGuarded={dailyGuarded} />}
          />
          <Area 
            type="monotone" 
            dataKey="guarded" 
            stroke="#6366f1" 
            fill="url(#guardianShieldGradient)"
            strokeWidth={1}
            strokeDasharray="4 2"
            name="Daily Volume"
          />
          <Area 
            type="monotone" 
            dataKey="leaked" 
            stroke="#f59e0b" 
            fill="url(#guardianSpikeGradient)"
            strokeWidth={2}
            name="Leakage Spikes"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
