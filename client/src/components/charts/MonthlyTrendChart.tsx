import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { MonthlyTrendPoint } from "@/context/MerchantContext";

interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[parseInt(m, 10) - 1]} '${year.slice(2)}`;
}

export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-500">
        No historical data available
      </div>
    );
  }

  const formattedData = data.map(d => ({
    ...d,
    label: formatMonth(d.month),
  }));

  return (
    <div className="h-[280px]" data-testid="chart-monthly-trend">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="label" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11, fontFamily: "JetBrains Mono" }}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11, fontFamily: "JetBrains Mono" }}
            tickFormatter={(v) => formatCurrency(v)}
            width={70}
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
              formatCurrency(value),
              name === "leaked" ? "Leaked" : "Recovered"
            ]}
          />
          <Bar dataKey="leaked" fill="#64748b" radius={[2, 2, 0, 0]} />
          <Bar dataKey="recovered" fill="#10b981" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
