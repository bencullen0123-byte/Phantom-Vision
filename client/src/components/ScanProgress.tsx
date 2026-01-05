import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Ghost, Loader2 } from "lucide-react";
import { useActiveScan } from "@/hooks/use-active-scan";

export default function ScanProgress() {
  const { data: scan, isLoading } = useActiveScan();
  const [, setLocation] = useLocation();

  // "Dopamine" Redirect: Navigate to Audit Report when scan completes
  useEffect(() => {
    if (scan?.progress && scan.progress >= 100) {
      // Small delay so user sees "100% Complete" before the transition
      const timer = setTimeout(() => setLocation('/audit'), 800);
      return () => clearTimeout(timer);
    }
  }, [scan?.progress, setLocation]);

  if (isLoading || !scan?.active) {
    return null;
  }

  const progress = scan.progress || 0;

  return (
    <Card className="p-6 mb-6 border-indigo-500/30 bg-gradient-to-r from-indigo-950/50 to-slate-900">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <Ghost className="w-6 h-6 text-indigo-400" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">Ghost Hunter Active</h3>
          <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Scanning
          </Badge>
        </div>
      </div>
      
      <Progress value={progress} className="h-2 mb-3" />
      
      <p className="text-sm text-slate-400">
        Scanning financial history... <span className="text-indigo-400 font-medium">{progress}%</span>
      </p>
    </Card>
  );
}
