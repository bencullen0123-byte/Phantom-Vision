import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, AlertTriangle, Loader2 } from "lucide-react";

interface CategoryData {
  category: string;
  value: number;
  count: number;
  percentage: number;
  color: string;
}

export interface LeakageForensicsData {
  categories: CategoryData[];
  totalValue: number;
  activeGhostCount: number;
  insight: string;
}

interface LeakageDonutProps {
  data?: LeakageForensicsData;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function LeakageDonut({ data: propData }: LeakageDonutProps) {
  const { data: fetchedData, isLoading, error } = useQuery<LeakageForensicsData>({
    queryKey: ["/api/merchant/leakage-forensics"],
    enabled: !propData,
  });

  const data = propData || fetchedData;

  if (!propData && isLoading) {
    return (
      <Card className="bg-slate-900/50 border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Leakage Forensics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!propData && (error || !data)) {
    return (
      <Card className="bg-slate-900/50 border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Leakage Forensics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-slate-500">
            Failed to load forensics data
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Leakage Forensics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex flex-col items-center justify-center text-slate-500 space-y-2">
            <AlertTriangle className="w-8 h-8 text-slate-600" />
            <p>No active ghosts detected</p>
            <p className="text-xs">Run a scan to detect payment failures</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center justify-between gap-4 flex-wrap">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Leakage Forensics
            </span>
            <span className="text-xs text-slate-500 font-normal">
              {data.activeGhostCount} active ghost{data.activeGhostCount !== 1 ? "s" : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]" data-testid="chart-leakage-donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.categories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="category"
                >
                  {data.categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    fontFamily: "JetBrains Mono",
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name
                  ]}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "12px", paddingLeft: "10px" }}
                  formatter={(value: string, entry: any) => (
                    <span className="text-slate-300">
                      {value} ({entry.payload.percentage}%)
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center pt-2">
            <p className="text-2xl font-mono text-slate-300" data-testid="text-total-leakage">
              {formatCurrency(data.totalValue)}
            </p>
            <p className="text-xs text-slate-500">Total Active Leakage</p>
          </div>
        </CardContent>
      </Card>

      {data.insight && (
        <Card className="bg-indigo-950/30 border-indigo-500/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-300 mb-1">Phantom Insight</p>
                <p className="text-sm text-slate-400" data-testid="text-phantom-insight">
                  {data.insight}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
