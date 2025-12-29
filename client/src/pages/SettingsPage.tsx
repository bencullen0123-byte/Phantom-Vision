import { useMerchant } from "@/context/MerchantContext";
import { Settings, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { merchant, isLoading } = useMerchant();

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Manage your PHANTOM configuration.</p>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-900 border border-white/10 rounded-md p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-1">Recovery Strategy</h3>
              <p className="text-slate-400 text-sm mb-3">
                Current strategy: <span className="font-mono text-white">{merchant?.recoveryStrategy ?? "oracle"}</span>
              </p>
              <p className="text-xs text-slate-500">
                Oracle timing uses anonymized payment data to send emails at optimal times.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-md p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-white mb-1">Stripe Connection</h3>
              <p className="text-slate-400 text-sm mb-3">
                {merchant ? "Connected" : "Not connected"}
              </p>
              <Button 
                variant="outline" 
                className="border-white/10 text-slate-200 hover:bg-white/5"
                onClick={() => window.location.href = "/api/auth/stripe"}
                data-testid="button-reconnect-stripe"
              >
                {merchant ? "Reconnect Stripe" : "Connect Stripe"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
