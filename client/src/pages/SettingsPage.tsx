import { useMerchant } from "@/context/MerchantContext";
import { 
  Settings, 
  Shield, 
  Loader2, 
  Building2, 
  Mail, 
  Palette, 
  Save,
  Lock,
  CheckCircle,
  RefreshCw,
  CreditCard,
  Zap,
  RotateCcw,
  Scan
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useScanJob } from "@/hooks/use-scan-job";
import { useState, useEffect } from "react";

interface BrandingFormData {
  businessName: string;
  supportEmail: string;
  brandColor: string;
  autoPilotEnabled: boolean;
}

interface BlueprintCanvasProps {
  businessName: string;
  brandColor: string;
  supportEmail: string;
}

const DEFAULT_BLUEPRINT = {
  subject: "Quick fix needed for your payment",
  heading: "Hi {{customer_name}},",
  body: "We've detected a technical friction point with your recent payment for {{business_name}}. This often happens when your bank requires additional verification. A quick confirmation should resolve this in seconds.",
  ctaText: "Complete Verification",
};

function renderWithPlaceholders(text: string, businessName: string): JSX.Element {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '{{customer_name}}') {
          return <span key={i} className="font-medium text-purple-600 bg-purple-50 px-0.5 rounded">Alex</span>;
        }
        if (part === '{{business_name}}') {
          return <span key={i} className="font-medium text-gray-900">{businessName || 'Your Business'}</span>;
        }
        if (part.startsWith('{{') && part.endsWith('}}')) {
          return <span key={i} className="font-medium text-purple-600 bg-purple-50 px-0.5 rounded">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function BlueprintCanvas({ businessName, brandColor, supportEmail }: BlueprintCanvasProps) {
  const displayName = businessName || 'Your Business Name';
  const displayEmail = supportEmail || 'support@yourbusiness.com';
  
  const [blueprint, setBlueprint] = useState({
    subject: DEFAULT_BLUEPRINT.subject,
    heading: DEFAULT_BLUEPRINT.heading,
    body: DEFAULT_BLUEPRINT.body,
    ctaText: DEFAULT_BLUEPRINT.ctaText,
  });
  
  const [focusedField, setFocusedField] = useState<string | null>(null);
  
  const handleReset = () => {
    setBlueprint({ ...DEFAULT_BLUEPRINT });
  };
  
  const isModified = 
    blueprint.subject !== DEFAULT_BLUEPRINT.subject ||
    blueprint.heading !== DEFAULT_BLUEPRINT.heading ||
    blueprint.body !== DEFAULT_BLUEPRINT.body ||
    blueprint.ctaText !== DEFAULT_BLUEPRINT.ctaText;
  
  return (
    <Card className="bg-slate-900/50 border-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-300 flex items-center justify-between gap-4 flex-wrap">
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-purple-400" />
            Blueprint Editor
          </span>
          {isModified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-xs text-slate-400 h-7"
              data-testid="button-reset-blueprint"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset to Default
            </Button>
          )}
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">Edit your Technical Bridge recovery message</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Subject Line</Label>
            <Input
              value={blueprint.subject}
              onChange={(e) => setBlueprint({ ...blueprint, subject: e.target.value })}
              onFocus={() => setFocusedField('subject')}
              onBlur={() => setFocusedField(null)}
              placeholder="Email subject..."
              className="bg-slate-800 border-white/10 text-white text-sm h-8"
              data-testid="input-blueprint-subject"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Greeting
              <span className="text-purple-400 ml-1">(use {"{{customer_name}}"})</span>
            </Label>
            <Input
              value={blueprint.heading}
              onChange={(e) => setBlueprint({ ...blueprint, heading: e.target.value })}
              onFocus={() => setFocusedField('heading')}
              onBlur={() => setFocusedField(null)}
              placeholder="Hi {{customer_name}},"
              className="bg-slate-800 border-white/10 text-white text-sm h-8"
              data-testid="input-blueprint-heading"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Message Body
              <span className="text-purple-400 ml-1">(use {"{{business_name}}"})</span>
            </Label>
            <Textarea
              value={blueprint.body}
              onChange={(e) => setBlueprint({ ...blueprint, body: e.target.value })}
              onFocus={() => setFocusedField('body')}
              onBlur={() => setFocusedField(null)}
              placeholder="Your recovery message..."
              className="bg-slate-800 border-white/10 text-white text-sm min-h-[80px] resize-none"
              data-testid="input-blueprint-body"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Button Text</Label>
            <Input
              value={blueprint.ctaText}
              onChange={(e) => setBlueprint({ ...blueprint, ctaText: e.target.value })}
              onFocus={() => setFocusedField('cta')}
              onBlur={() => setFocusedField(null)}
              placeholder="Complete Verification"
              className="bg-slate-800 border-white/10 text-white text-sm h-8"
              data-testid="input-blueprint-cta"
            />
          </div>
        </div>
        
        <div className="border-t border-white/5 pt-4">
          <p className="text-xs text-slate-500 mb-3 text-center">Live Preview</p>
          <div className="relative mx-auto" style={{ maxWidth: '280px' }}>
            <div className="bg-slate-800 rounded-3xl p-1.5 border-2 border-slate-700 shadow-xl">
              <div className="bg-slate-700 rounded-full w-16 h-1 mx-auto mb-1.5" />
              
              <div className="rounded-2xl overflow-hidden border border-slate-600">
                <div className={`bg-slate-100 px-2 py-1.5 border-b border-slate-300 transition-all ${focusedField === 'subject' ? 'ring-2 ring-purple-500 ring-inset' : ''}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-500 w-10">From:</span>
                      <span className="text-slate-700 font-medium truncate">{displayName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-500 w-10">Reply-To:</span>
                      <span className="text-purple-600 font-medium truncate">{displayEmail}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-500 w-10">Subject:</span>
                      <span className="text-slate-800 font-semibold truncate">{blueprint.subject}</span>
                    </div>
                  </div>
                </div>

                <div 
                  className="py-2 px-3 text-center"
                  style={{ backgroundColor: brandColor }}
                >
                  <h3 className="text-white font-semibold text-[11px]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                    {displayName}
                  </h3>
                </div>

                <div className="bg-white p-3 space-y-2">
                  <p className={`text-[10px] text-gray-600 transition-all ${focusedField === 'heading' ? 'ring-2 ring-purple-500 rounded px-1 -mx-1' : ''}`}>
                    {renderWithPlaceholders(blueprint.heading, displayName)}
                  </p>
                  <p className={`text-[10px] text-gray-600 leading-relaxed transition-all ${focusedField === 'body' ? 'ring-2 ring-purple-500 rounded px-1 -mx-1' : ''}`}>
                    {renderWithPlaceholders(blueprint.body, displayName)}
                  </p>
                  <div className={`pt-1.5 transition-all ${focusedField === 'cta' ? 'ring-2 ring-purple-500 rounded' : ''}`}>
                    <button 
                      className="w-full px-3 py-2 rounded-md text-white text-[10px] font-medium shadow-sm"
                      style={{ backgroundColor: brandColor }}
                    >
                      {blueprint.ctaText}
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-400 text-center pt-0.5">
                    Secure payment powered by Stripe
                  </p>
                </div>

                <div className="bg-gray-100 py-2 px-3 text-center border-t border-gray-200">
                  <p className="text-[10px] text-gray-500">
                    Need help? Reply to this email.
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {displayName}
                  </p>
                </div>
              </div>

              <div className="bg-slate-700 rounded-full w-10 h-10 mx-auto mt-2 border-2 border-slate-600" />
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-md bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-purple-300">Technical Bridge Tone</p>
              <p className="text-xs text-slate-400 mt-1">
                Emphasizes "technical friction" rather than "payment failure" to reduce customer anxiety and increase resolution rates.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PlaybookCardProps {
  title: string;
  description: string;
  icon: typeof Shield;
  iconColor: string;
  isActive: boolean;
}

function PlaybookCard({ title, description, icon: Icon, iconColor, isActive }: PlaybookCardProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md border border-white/10 bg-slate-800/50">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <Badge 
        variant="outline" 
        className={isActive 
          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs" 
          : "bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs"
        }
      >
        {isActive ? (
          <>
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </>
        ) : (
          "Ready"
        )}
      </Badge>
    </div>
  );
}

function SentinelArmingStation() {
  const { merchant, refetch } = useMerchant();
  const { toast } = useToast();
  
  const hasSupportEmail = Boolean(merchant?.supportEmail?.trim());
  const isArmed = merchant?.autoPilotEnabled || false;

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/merchant/branding", {
        autoPilotEnabled: enabled,
      });
      return res.json();
    },
    onSuccess: (_, enabled) => {
      toast({
        title: enabled ? "Sentinel Armed" : "Sentinel Disarmed",
        description: enabled 
          ? "Auto-Pilot is now active. Recovery emails will be sent automatically."
          : "Auto-Pilot disabled. Manual approval required for recovery emails.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (enabled: boolean) => {
    if (!hasSupportEmail && enabled) {
      toast({
        title: "Security Lock Active",
        description: "Add a support email before enabling Auto-Pilot.",
        variant: "destructive",
      });
      return;
    }
    
    toggleMutation.mutate(enabled);
  };
  
  const isToggling = toggleMutation.isPending;

  return (
    <Card className={`bg-slate-900 border-2 transition-all duration-500 ${
      isArmed 
        ? "border-emerald-500/50 animate-sentinel-armed" 
        : "border-white/10"
    }`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Shield className={`w-5 h-5 ${isArmed ? "text-emerald-400" : "text-slate-400"}`} />
          Sentinel Auto-Pilot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`p-6 rounded-lg border-2 transition-all duration-300 ${
          isArmed 
            ? "bg-emerald-500/10 border-emerald-500/30" 
            : "bg-slate-800/50 border-white/10"
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isArmed 
                  ? "bg-emerald-500/30" 
                  : "bg-slate-700"
              }`}>
                {isArmed ? (
                  <Zap className="w-7 h-7 text-emerald-400" />
                ) : (
                  <Lock className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div>
                <h3 className={`text-xl font-semibold ${isArmed ? "text-emerald-400" : "text-white"}`}>
                  {isArmed ? "SENTINEL ARMED" : "Sentinel Standby"}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {isArmed 
                    ? "Autonomous recovery is active. Ghosts are being hunted." 
                    : "Toggle to enable autonomous email recovery."
                  }
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Switch
                checked={isArmed}
                onCheckedChange={handleToggle}
                disabled={isToggling || (!hasSupportEmail && !isArmed)}
                className={`scale-125 ${isArmed ? "data-[state=checked]:bg-emerald-600" : ""}`}
                data-testid="switch-sentinel-autopilot"
              />
              {!hasSupportEmail && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Add support email
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            Protection Coverage Audit
          </h4>
          <div className="space-y-2">
            <PlaybookCard
              title="Technical Bridge"
              description="3DS authentication recovery"
              icon={Shield}
              iconColor="bg-purple-500/20 text-purple-400"
              isActive={isArmed}
            />
            <PlaybookCard
              title="Card Refresh"
              description="Expired/declined card outreach"
              icon={CreditCard}
              iconColor="bg-orange-500/20 text-orange-400"
              isActive={isArmed}
            />
            <PlaybookCard
              title="Smart Retry"
              description="Liquidity timing optimization"
              icon={RefreshCw}
              iconColor="bg-blue-500/20 text-blue-400"
              isActive={isArmed}
            />
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
    mutationFn: async (data: Omit<BrandingFormData, 'autoPilotEnabled'>) => {
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
    const { autoPilotEnabled, ...brandingData } = formData;
    updateMutation.mutate(brandingData);
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

      <BlueprintCanvas 
        businessName={formData.businessName} 
        brandColor={formData.brandColor}
        supportEmail={formData.supportEmail}
      />
    </div>
  );
}

function SimulationEngine() {
  const { toast } = useToast();
  const { refetch } = useMerchant();

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dev/seed-scenarios");
      return res.json();
    },
    onSuccess: (data: { created?: { ghosts?: number } }) => {
      const count = data?.created?.ghosts || 0;
      toast({ 
        title: "Simulation Complete", 
        description: `Generated ${count} synthetic failures.` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ghosts"] });
      refetch();
    },
    onError: (e: Error) => {
      toast({ 
        title: "Simulation Failed", 
        description: e.message, 
        variant: "destructive" 
      });
    }
  });

  return (
    <Card className="bg-slate-900 border-amber-500/20">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-white mb-1">Chaos Engine</h3>
            <p className="text-slate-400 text-sm mb-3">
              Inject 150+ synthetic payment failures for stress testing and demos.
            </p>
            <Button 
              variant="outline" 
              className="border-amber-500/50 text-amber-400"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-ignite-simulation"
            >
              {seedMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Ignite Simulation
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiagnosticOperations() {
  const { toast } = useToast();
  const { startScan, status, progress, isScanning, error } = useScanJob();

  useEffect(() => {
    if (status === "completed") {
      toast({
        title: "Scan Complete",
        description: "Your financial data has been refreshed.",
      });
    } else if (status === "failed" && error) {
      toast({
        title: "Scan Failed",
        description: error,
        variant: "destructive",
      });
    }
  }, [status, error, toast]);

  return (
    <Card className="bg-slate-900 border-white/10">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Scan className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-lg font-medium text-white mb-1">Diagnostic Scan</h3>
              <p className="text-slate-400 text-sm">
                Rescan your Stripe account to detect new ghost users and refresh metrics.
              </p>
            </div>
            
            {isScanning && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Scanning...</span>
                  <span 
                    className="text-purple-400 font-mono"
                    data-testid="text-scan-progress"
                  >
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}
            
            <Button 
              variant="outline" 
              className="border-white/10 text-slate-200"
              onClick={() => startScan()}
              disabled={isScanning}
              data-testid="button-rescan"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning... {progress}%
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rescan Now
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
        <h1 className="text-3xl font-semibold text-white mb-2">The Control Plane</h1>
        <p className="text-slate-400">Arm the Sentinel and configure your recovery mission parameters.</p>
      </div>

      {isAuthenticated && merchant && (
        <SentinelArmingStation />
      )}

      {isAuthenticated && merchant && (
        <MerchantProfileForm />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAuthenticated && merchant && (
          <DiagnosticOperations />
        )}

        {isAuthenticated && merchant && (
          <SimulationEngine />
        )}

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
