import { useMerchant } from "@/context/MerchantContext";
import { DollarSign } from "lucide-react";

export default function RecoveriesPage() {
  const { merchant, isLoading } = useMerchant();

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(cents / 100);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Recoveries</h1>
        <p className="text-slate-400">Track attributed and organic revenue recoveries.</p>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-md p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <DollarSign className="w-6 h-6 text-emerald-400" />
        </div>
        
        <p className="text-slate-400 mb-2">Total Recovered</p>
        <p 
          className="font-mono text-4xl text-emerald-500"
          data-testid="text-recoveries-total"
        >
          {formatCurrency(merchant?.totalRecoveredCents ?? 0)}
        </p>
        
        <p className="text-sm text-slate-500 mt-4">
          Detailed recovery breakdown coming soon.
        </p>
      </div>
    </div>
  );
}
