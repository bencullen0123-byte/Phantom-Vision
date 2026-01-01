import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, RefreshCw, TrendingDown, TrendingUp, Zap, Shield, Info, Clock } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DiagnosticPulse {
  totalInvoicesScanned: number;
  requires3dsCount: number;
  cardBrandDistribution: Record<string, number>;
  lastScanAt: string | null;
  lastScanStatus: string | null;
}

interface GoldenHourData {
  count: number;
  oldestMinutesAgo: number | null;
}

function RefreshAuditButton() {
  const { refetch } = useMerchant();
  const { toast } = useToast();

  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit/run", { forceSync: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Audit Complete",
        description: `Found ${data.total_ghosts_found || 0} new issues identified.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ghosts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diagnostic-pulse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/golden-hour"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Audit Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => auditMutation.mutate()}
      disabled={auditMutation.isPending}
      className="border-white/10 text-slate-300"
      data-testid="button-refresh-audit"
    >
      {auditMutation.isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Hunting Ghosts...
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Audit
        </>
      )}
    </Button>
  );
}

function AutoPilotToggle() {
  const { merchant, refetch } = useMerchant();
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/merchant/branding", {
        autoPilotEnabled: enabled,
      });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      toast({
        title: enabled ? "Auto-Pilot Activated" : "Auto-Pilot Deactivated",
        description: enabled 
          ? "PHANTOM Sentinel will now automatically send recovery emails."
          : "Recovery emails require manual approval.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update Auto-Pilot",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!merchant) return null;

  const isEnabled = merchant.autoPilotEnabled;

  return (
    <div 
      className={`flex items-center gap-3 px-4 py-2 rounded-md border transition-colors ${
        isEnabled 
          ? 'bg-emerald-950/50 border-emerald-500/30' 
          : 'bg-slate-800/50 border-white/10'
      }`}
    >
      <Zap className={`w-4 h-4 ${isEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
      <span className={`text-sm font-medium ${isEnabled ? 'text-emerald-300' : 'text-slate-400'}`}>
        {isEnabled ? 'Auto-Pilot ON' : 'Auto-Pilot OFF'}
      </span>
      <Switch
        checked={isEnabled}
        onCheckedChange={(checked) => toggleMutation.mutate(checked)}
        disabled={toggleMutation.isPending}
        data-testid="switch-auto-pilot"
        className="data-[state=checked]:bg-emerald-500"
      />
    </div>
  );
}

function DiagnosticDNA({ pulse }: { pulse?: DiagnosticPulse }) {
  if (!pulse) return null;
  
  const totalGhosts = Object.values(pulse.cardBrandDistribution).reduce((a, b) => a + b, 0);
  if (totalGhosts === 0) return null;
  
  const technicalFriction = pulse.requires3dsCount;
  const cardObsolescence = totalGhosts - technicalFriction;
  
  const techPercent = totalGhosts > 0 ? (technicalFriction / totalGhosts) * 100 : 0;
  const cardPercent = totalGhosts > 0 ? (cardObsolescence / totalGhosts) * 100 : 0;

  return (
    <div className="mt-3 pt-3 border-t border-white/5">
      <p className="text-xs text-slate-500 mb-2">Diagnostic DNA</p>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
        {techPercent > 0 && (
          <div 
            className="bg-amber-500 h-full" 
            style={{ width: `${techPercent}%` }}
            title={`Technical Friction: ${technicalFriction}`}
          />
        )}
        {cardPercent > 0 && (
          <div 
            className="bg-red-500 h-full" 
            style={{ width: `${cardPercent}%` }}
            title={`Card Obsolescence: ${cardObsolescence}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-slate-500">3DS/Auth ({technicalFriction})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-slate-500">Card Issues ({cardObsolescence})</span>
        </div>
      </div>
    </div>
  );
}

function GoldenHourBadge({ data }: { data?: GoldenHourData }) {
  if (!data || data.count === 0) return null;
  
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-950/50 border border-amber-500/30">
      <Clock className="w-3.5 h-3.5 text-amber-400" />
      <span className="text-xs font-medium text-amber-300">
        {data.count} ghost{data.count !== 1 ? 's' : ''} in Golden Hour
      </span>
    </div>
  );
}

export default function MoneyHero() {
  const { merchant } = useMerchant();
  const { stats, isLoading: statsLoading } = useMerchantStats();
  
  const { data: diagnosticPulse } = useQuery<DiagnosticPulse>({
    queryKey: ["/api/diagnostic-pulse"],
  });
  
  const { data: goldenHourData } = useQuery<GoldenHourData>({
    queryKey: ["/api/golden-hour"],
  });

  if (!merchant) return null;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: stats?.defaultCurrency?.toUpperCase() || "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const lifetime = stats?.lifetime || { allTimeLeakedCents: 0, totalRecoveredCents: 0, totalGhostCount: 0 };
  const grossInvoiced = stats?.grossInvoicedCents || 0;
  const shadowLeakage = lifetime.allTimeLeakedCents;
  const projectedRecovery = Math.round(shadowLeakage * 0.40);
  
  const leakageRate = grossInvoiced > 0 ? (shadowLeakage / grossInvoiced) * 100 : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-indigo-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-slate-400">Total Volume Guarded</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs bg-slate-900 border-white/10">
                  <p className="text-xs text-slate-300">
                    This represents the total value of all recurring invoices PHANTOM is actively monitoring for failure.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p 
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
              data-testid="text-volume-guarded"
            >
              {statsLoading ? "..." : formatCurrency(grossInvoiced)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GoldenHourBadge data={goldenHourData} />
          <RefreshAuditButton />
          <AutoPilotToggle />
        </div>
      </div>

      <div className="flex-1 flex items-center">
        <div className="w-full grid grid-cols-2 gap-6">
          <div className="flex flex-col p-4 rounded-md bg-red-950/30 border border-red-500/20">
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-slate-500 text-xs mb-1 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                Shadow Leakage
              </p>
              <p 
                className="text-2xl font-bold text-red-400"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
                data-testid="text-shadow-leakage"
              >
                {statsLoading ? "..." : formatCurrency(shadowLeakage)}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {leakageRate.toFixed(1)}% of guarded volume
              </p>
              
              {projectedRecovery > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">
                    {formatCurrency(projectedRecovery)} projected recovery
                  </span>
                </div>
              )}
            </div>
            
            <DiagnosticDNA pulse={diagnosticPulse} />
          </div>

          <div className="flex flex-col items-center justify-center p-4 rounded-md bg-emerald-950/30 border border-emerald-500/20">
            <p className="text-slate-500 text-xs mb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Recovered
            </p>
            <p 
              className="text-2xl font-bold text-emerald-400"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
              data-testid="text-recovered-hero"
            >
              {statsLoading ? "..." : formatCurrency(lifetime.totalRecoveredCents)}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {lifetime.totalGhostCount} ghosts detected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
