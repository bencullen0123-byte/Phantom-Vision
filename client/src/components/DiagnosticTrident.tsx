import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp, AlertTriangle, Lightbulb, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface DiagnosticPulse {
  totalInvoicesScanned: number;
  requires3dsCount: number;
  cardBrandDistribution: Record<string, number>;
  lastScanAt: string | null;
  lastScanStatus: string | null;
}

interface CategoryData {
  category: string;
  value: number;
  count: number;
  percentage: number;
  color: string;
}

interface LeakageForensicsData {
  categories: CategoryData[];
  totalValue: number;
  activeGhostCount: number;
  insight: string;
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ShadowLeakageCard() {
  const { stats, isLoading } = useMerchantStats();
  
  const lifetime = stats?.lifetime || { allTimeLeakedCents: 0, totalRecoveredCents: 0, totalGhostCount: 0 };
  const grossInvoiced = stats?.grossInvoicedCents || 0;
  const shadowLeakage = lifetime.allTimeLeakedCents;
  const projectedRecovery = Math.round(shadowLeakage * 0.40);
  const leakageRate = grossInvoiced > 0 ? (shadowLeakage / grossInvoiced) * 100 : 0;

  return (
    <Card className="bg-slate-900/50 border-white/5 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-400" />
          Shadow Leakage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col justify-center">
        <div className="text-center py-4">
          <p 
            className="text-3xl font-bold text-red-400"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-trident-shadow-leakage"
          >
            {isLoading ? "..." : formatEuro(shadowLeakage)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {leakageRate.toFixed(1)}% of guarded volume
          </p>
        </div>
        
        {projectedRecovery > 0 && (
          <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-md bg-emerald-950/30 border border-emerald-500/20 mt-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <div>
              <p 
                className="text-lg font-bold text-emerald-400"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
                data-testid="text-projected-recovery"
              >
                {formatEuro(projectedRecovery)}
              </p>
              <p className="text-xs text-emerald-500/70">Projected Recovery</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticDNACard() {
  const { data: diagnosticPulse } = useQuery<DiagnosticPulse>({
    queryKey: ["/api/diagnostic-pulse"],
  });

  const totalGhosts = diagnosticPulse 
    ? Object.values(diagnosticPulse.cardBrandDistribution).reduce((a, b) => a + b, 0) 
    : 0;
  const technicalFriction = diagnosticPulse?.requires3dsCount || 0;
  const cardObsolescence = totalGhosts - technicalFriction;
  
  const techPercent = totalGhosts > 0 ? (technicalFriction / totalGhosts) * 100 : 0;
  const cardPercent = totalGhosts > 0 ? (cardObsolescence / totalGhosts) * 100 : 0;

  return (
    <Card className="bg-slate-900/50 border-white/5 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" />
          Diagnostic DNA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500 mb-4">Root cause analysis of payment failures</p>
        
        {totalGhosts === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <Shield className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm">No active ghosts</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-400 font-medium">3DS / Authentication</span>
                  <span className="text-slate-400">{technicalFriction} ({techPercent.toFixed(0)}%)</span>
                </div>
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
                    style={{ width: `${techPercent}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400 font-medium">Card Issues</span>
                  <span className="text-slate-400">{cardObsolescence} ({cardPercent.toFixed(0)}%)</span>
                </div>
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all"
                    style={{ width: `${cardPercent}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-3 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Total Active Ghosts</span>
                <span className="text-sm font-bold text-white" data-testid="text-total-ghosts-dna">
                  {totalGhosts}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeakageForensicsCard() {
  const { stats } = useMerchantStats();
  const data = stats?.leakageDistribution;

  if (!data || data.categories.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-white/5 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Leakage Forensics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <AlertTriangle className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm">No active ghosts detected</p>
            <p className="text-xs mt-1">Run a scan to detect payment failures</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-white/5 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300 flex items-center justify-between gap-4 flex-wrap">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Leakage Forensics
          </span>
          <span className="text-xs text-slate-500 font-normal">
            {data.activeGhostCount} ghost{data.activeGhostCount !== 1 ? "s" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="h-[160px]" data-testid="chart-trident-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.categories}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
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
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => [
                  formatEuro(value),
                  name
                ]}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={6}
                wrapperStyle={{ fontSize: "10px", paddingLeft: "8px" }}
                formatter={(value: string, entry: any) => (
                  <span className="text-slate-400 text-xs">
                    {value} ({entry.payload.percentage}%)
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="text-center py-2">
          <p className="text-lg font-mono text-slate-300 font-bold" data-testid="text-trident-total-leakage">
            {formatEuro(data.totalValue)}
          </p>
          <p className="text-xs text-slate-500">Total Active Leakage</p>
        </div>

        {data.insight && (
          <div className="mt-auto pt-3 border-t border-white/5">
            <div className="flex items-start gap-2 p-2 rounded-md bg-indigo-950/30 border border-indigo-500/20">
              <Lightbulb className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400" data-testid="text-trident-insight">
                {data.insight}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DiagnosticTrident() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <div className="h-full">
        <ShadowLeakageCard />
      </div>
      <div className="h-full">
        <DiagnosticDNACard />
      </div>
      <div className="h-full">
        <LeakageForensicsCard />
      </div>
    </div>
  );
}
