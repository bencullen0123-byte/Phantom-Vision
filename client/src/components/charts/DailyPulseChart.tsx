import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { DailyPulsePoint } from "@/context/MerchantContext";

interface DailyPulseChartProps {
  data: DailyPulsePoint[];
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

export default function DailyPulseChart({ data, currency = "gbp" }: DailyPulseChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-slate-500">
        No recent activity
      </div>
    );
  }

  const sortedData = sortChronologically(data);
  const formattedData = sortedData.map(d => ({
    ...d,
    label: formatDate(d.date),
  }));

  return (
    <div className="h-[220px]" data-testid="chart-daily-pulse">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="leakedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="recoveredGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="label" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }}
            interval="preserveStartEnd"
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickFormatter={(v) => formatCurrency(v, currency)}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              fontFamily: "JetBrains Mono",
            }}
            labelStyle={{ color: "#e2e8f0", marginBottom: "4px" }}
            formatter={(value: number, name: string) => [
              formatCurrencyFull(value, currency),
              name === "leaked" ? "New Leakage" : "Recovered"
            ]}
          />
          <Area 
            type="monotone" 
            dataKey="leaked" 
            stroke="#64748b" 
            fill="url(#leakedGradient)"
            strokeWidth={2}
          />
          <Area 
            type="monotone" 
            dataKey="recovered" 
            stroke="#10b981" 
            fill="url(#recoveredGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
