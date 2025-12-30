import { Activity, Search, CheckCircle, Ghost } from "lucide-react";

export interface FunnelData {
  total: number;
  recurring: number;
  skipped: number;
  ghosts: number;
}

export function parseDiagnosticMessage(message: string): FunnelData | null {
  const totalMatch = message.match(/Processed (\d+) invoices/);
  const recurringMatch = message.match(/(\d+) linked to subscriptions/);
  const skippedMatch = message.match(/(\d+) excluded/);
  
  if (!totalMatch || !recurringMatch || !skippedMatch) {
    return null;
  }
  
  const total = parseInt(totalMatch[1], 10);
  const recurring = parseInt(recurringMatch[1], 10);
  const skipped = parseInt(skippedMatch[1], 10);
  const ghosts = recurring - skipped;
  
  return { total, recurring, skipped, ghosts: ghosts > 0 ? ghosts : 0 };
}

function FunnelSkeleton() {
  return (
    <div className="bg-slate-900/80 border border-white/5 rounded-md p-5 mb-4" data-testid="forensic-funnel-skeleton">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-slate-600" />
        <span className="text-xs text-slate-500 uppercase tracking-wide">Forensic Funnel</span>
        <span className="text-[10px] text-slate-600 ml-auto">Waiting for Audit</span>
      </div>
      
      <div className="relative flex items-center justify-center gap-0">
        <div className="flex-[3] h-20 bg-slate-800/50 rounded-l-md flex items-center justify-center border border-slate-700/30 animate-slow-pulse">
          <div className="text-center">
            <div className="h-6 w-16 bg-slate-700/50 rounded mx-auto mb-1" />
            <div className="h-3 w-20 bg-slate-700/30 rounded mx-auto" />
          </div>
        </div>
        
        <div className="w-0 h-0 border-t-[40px] border-t-transparent border-b-[40px] border-b-transparent border-l-[16px] border-l-slate-800/50" />
        
        <div className="flex-[2] h-16 bg-slate-800/40 flex items-center justify-center border-y border-slate-700/20 animate-slow-pulse">
          <div className="text-center">
            <div className="h-5 w-12 bg-slate-700/40 rounded mx-auto mb-1" />
            <div className="h-3 w-16 bg-slate-700/20 rounded mx-auto" />
          </div>
        </div>
        
        <div className="w-0 h-0 border-t-[32px] border-t-transparent border-b-[32px] border-b-transparent border-l-[12px] border-l-slate-800/40" />
        
        <div className="flex-1 h-12 bg-slate-800/30 rounded-r-md flex items-center justify-center border border-slate-700/10 animate-slow-pulse">
          <div className="text-center">
            <div className="h-4 w-8 bg-slate-700/30 rounded mx-auto mb-1" />
            <div className="h-2 w-12 bg-slate-700/10 rounded mx-auto" />
          </div>
        </div>
      </div>
      
      <p className="text-center text-[10px] text-slate-600 mt-4">
        Run a Deep Harvest scan to see your invoice funnel
      </p>
    </div>
  );
}

export function ForensicFunnel({ data }: { data: FunnelData | null }) {
  if (!data) {
    return <FunnelSkeleton />;
  }
  
  const hasGhosts = data.ghosts > 0;
  const healthyCount = data.recurring - data.ghosts;
  const passedCount = data.total - data.recurring;
  
  return (
    <div className="bg-slate-900/80 border border-white/5 rounded-md p-5 mb-4" data-testid="forensic-funnel">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-slate-500" />
        <span className="text-xs text-slate-400 uppercase tracking-wide">Forensic Funnel</span>
        <span className="text-[10px] text-slate-500 ml-auto">Decision Transparency</span>
      </div>
      
      <div className="relative flex items-center gap-0">
        <div 
          className="flex-[3] h-24 bg-gradient-to-r from-slate-800 to-slate-700 rounded-l-md flex items-center justify-center border border-slate-600/30 relative overflow-visible"
          style={{ clipPath: "polygon(0 0, 100% 10%, 100% 90%, 0 100%)" }}
        >
          <div className="text-center z-10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Search className="w-3 h-3 text-slate-400" />
            </div>
            <div 
              className="text-2xl font-semibold text-slate-300"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
              data-testid="funnel-audited"
            >
              {data.total.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">Audited</div>
          </div>
        </div>
        
        <div 
          className="flex-[2] h-20 bg-gradient-to-r from-emerald-900/60 to-emerald-800/50 flex items-center justify-center border-y border-emerald-500/20 relative"
          style={{ clipPath: "polygon(0 5%, 100% 15%, 100% 85%, 0 95%)" }}
        >
          <div className="text-center z-10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
            </div>
            <div 
              className="text-xl font-semibold text-emerald-400"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
              data-testid="funnel-verified"
            >
              {healthyCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">Verified</div>
          </div>
        </div>
        
        <div 
          className={`flex-1 h-16 bg-gradient-to-r from-sky-900/70 to-sky-800/60 rounded-r-md flex items-center justify-center border border-sky-500/30 relative ${hasGhosts ? 'shadow-[0_0_20px_rgba(56,189,248,0.3)]' : ''}`}
          style={{ clipPath: "polygon(0 10%, 100% 20%, 100% 80%, 0 90%)" }}
        >
          <div className={`text-center z-10 ${hasGhosts ? 'animate-slow-pulse' : ''}`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <Ghost className="w-3 h-3 text-sky-400" />
            </div>
            <div 
              className="text-lg font-semibold text-sky-400"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
              data-testid="funnel-actionable"
            >
              {data.ghosts.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">Actionable</div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-between text-[9px] text-slate-600 mt-3 px-2">
        <span>{passedCount.toLocaleString()} one-time invoices filtered</span>
        <span>{data.recurring.toLocaleString()} subscription invoices analyzed</span>
        <span>{data.ghosts > 0 ? `${data.ghosts} ghosts detected` : 'No ghosts found'}</span>
      </div>
    </div>
  );
}
