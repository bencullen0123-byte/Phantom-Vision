import { useMerchant } from "@/context/MerchantContext";
import { Settings, Shield, Loader2, Building2, Mail, Palette, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";

interface BrandingFormData {
  businessName: string;
  supportEmail: string;
  brandColor: string;
  autoPilotEnabled: boolean;
}

function BrandPreview({ businessName, brandColor }: { businessName: string; brandColor: string }) {
  return (
    <Card className="bg-slate-900/50 border-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300">Brand Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-white/10 overflow-hidden">
          <div 
            className="py-4 px-6 text-center"
            style={{ backgroundColor: brandColor }}
          >
            <h3 className="text-white font-semibold text-lg" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
              {businessName || 'Your Business Name'}
            </h3>
          </div>
          <div className="bg-white p-4 space-y-3">
            <p className="text-sm text-gray-600">
              Hi <span className="font-medium text-gray-900">Customer Name</span>,
            </p>
            <p className="text-sm text-gray-600">
              It looks like the latest payment of <span className="font-medium text-gray-900">£50.00</span> for{' '}
              <span className="font-medium text-gray-900">{businessName || 'Your Business'}</span> didn't go through.
            </p>
            <div className="pt-2">
              <button 
                className="px-4 py-2 rounded-md text-white text-sm font-medium"
                style={{ backgroundColor: brandColor }}
              >
                Update Payment Method
              </button>
            </div>
          </div>
          <div className="bg-gray-100 py-3 px-4 text-center">
            <p className="text-xs text-gray-500">
              This email was sent by {businessName || 'Your Business Name'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MerchantProfileForm() {
  const { merchant, refetch } = useMerchant();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<BrandingFormData>({
    businessName: '',
    supportEmail: '',
    brandColor: '#6366f1',
    autoPilotEnabled: false,
  });

  useEffect(() => {
    if (merchant) {
      setFormData({
        businessName: merchant.businessName || '',
        supportEmail: merchant.supportEmail || '',
        brandColor: merchant.brandColor || '#6366f1',
        autoPilotEnabled: merchant.autoPilotEnabled || false,
      });
    }
  }, [merchant]);

  const updateMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      const res = await apiRequest("PATCH", "/api/merchant/branding", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your merchant branding has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, brandColor: e.target.value });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-slate-900 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="w-5 h-5 text-indigo-400" />
            Merchant Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-slate-300">Business Name</Label>
              <Input
                id="businessName"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                placeholder="e.g., Found Factory"
                className="bg-slate-800 border-white/10 text-white placeholder:text-slate-500"
                data-testid="input-business-name"
              />
              <p className="text-xs text-slate-500">Displayed in email headers and footers</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supportEmail" className="text-slate-300">Support Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="supportEmail"
                  type="email"
                  value={formData.supportEmail}
                  onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                  placeholder="support@example.com"
                  className="bg-slate-800 border-white/10 text-white placeholder:text-slate-500 pl-10"
                  data-testid="input-support-email"
                />
              </div>
              <p className="text-xs text-slate-500">Reply-to address for recovery emails</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandColor" className="text-slate-300">Brand Color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Palette className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="brandColor"
                    value={formData.brandColor}
                    onChange={(e) => setFormData({ ...formData, brandColor: e.target.value })}
                    placeholder="#6366f1"
                    className="bg-slate-800 border-white/10 text-white placeholder:text-slate-500 pl-10 w-32"
                    data-testid="input-brand-color"
                  />
                </div>
                <input
                  type="color"
                  value={formData.brandColor}
                  onChange={handleColorChange}
                  className="w-10 h-10 rounded-md border border-white/10 cursor-pointer"
                  data-testid="input-color-picker"
                />
                <div 
                  className="w-10 h-10 rounded-md border border-white/10"
                  style={{ backgroundColor: formData.brandColor }}
                />
              </div>
              <p className="text-xs text-slate-500">Used in email buttons and headers</p>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="autoPilot" className="text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Auto-Pilot Mode
                  </Label>
                  <p className="text-xs text-slate-500">
                    Automatically send recovery emails without manual approval
                  </p>
                </div>
                <Switch
                  id="autoPilot"
                  checked={formData.autoPilotEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoPilotEnabled: checked })}
                  data-testid="switch-auto-pilot"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <BrandPreview 
        businessName={formData.businessName} 
        brandColor={formData.brandColor} 
      />
    </div>
  );
}

export default function SettingsPage() {
  const { merchant, isLoading, isAuthenticated, authLoading } = useMerchant();

  if (authLoading || isLoading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Manage your PHANTOM configuration and branding.</p>
      </div>

      {isAuthenticated && merchant && (
        <MerchantProfileForm />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAuthenticated && merchant && (
          <Card className="bg-slate-900 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                  <Settings className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1">Recovery Strategy</h3>
                  <p className="text-slate-400 text-sm mb-3">
                    Current strategy: <span className="font-mono text-white">{merchant.recoveryStrategy}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Oracle timing uses anonymized payment data to send emails at optimal times.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900 border-white/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white mb-1">Stripe Connection</h3>
                <p className="text-slate-400 text-sm mb-3">
                  {isAuthenticated ? "Connected" : "Not connected"}
                </p>
                <Button 
                  variant="outline" 
                  className="border-white/10 text-slate-200"
                  onClick={() => window.location.href = "/api/auth/stripe"}
                  data-testid="button-reconnect-stripe"
                >
                  {isAuthenticated ? "Reconnect Stripe" : "Connect Stripe"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
