import { useMerchant } from "@/context/MerchantContext";
import { TrendingUp, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function GrowthPage() {
  const { merchant, isLoading, isAuthenticated, authLoading } = useMerchant();

  if (authLoading || isLoading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 mb-4">Please connect your Stripe account to view growth metrics.</p>
        <Link href="/">
          <Button variant="outline" className="border-white/10" data-testid="link-dashboard">
            Go to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Growth</h1>
        <p className="text-slate-400">Liquidity Oracle insights and recovery trends.</p>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-md p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-indigo-600/20 flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-indigo-400" />
        </div>
        
        <p className="text-slate-400 mb-2">Tier Capacity</p>
        <p 
          className="font-mono text-4xl text-white"
          data-testid="text-tier-capacity"
        >
          {merchant?.tierLimit ?? 50}
          <span className="text-lg text-slate-500 ml-2">ghosts</span>
        </p>
        
        <p className="text-sm text-slate-500 mt-4">
          Oracle timing and growth analytics coming soon.
        </p>
      </div>
    </div>
  );
}
