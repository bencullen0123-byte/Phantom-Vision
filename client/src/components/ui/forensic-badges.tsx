import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  Globe, 
  Shield, 
  RefreshCw, 
  AlertTriangle,
  Zap,
  Crown,
  HelpCircle
} from "lucide-react";
import { SiVisa, SiMastercard, SiAmericanexpress } from "react-icons/si";

type RecoveryStrategy = "technical_bridge" | "smart_retry" | "card_refresh" | "high_value_manual" | null;

interface StrategyConfig {
  label: string;
  icon: typeof Shield;
  className: string;
}

const strategyConfigs: Record<string, StrategyConfig> = {
  technical_bridge: {
    label: "3DS Bridge",
    icon: Shield,
    className: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  smart_retry: {
    label: "Smart Retry",
    icon: RefreshCw,
    className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  card_refresh: {
    label: "Card Refresh",
    icon: CreditCard,
    className: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  },
  high_value_manual: {
    label: "VIP Manual",
    icon: Crown,
    className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
};

export function StrategyBadge({ strategy }: { strategy: RecoveryStrategy }) {
  if (!strategy) {
    return (
      <Badge variant="outline" className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-xs">
        <HelpCircle className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  }

  const config = strategyConfigs[strategy];
  if (!config) {
    return (
      <Badge variant="outline" className="bg-slate-500/20 text-slate-400 border-slate-500/30 text-xs">
        {strategy}
      </Badge>
    );
  }

  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.className} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

const cardBrandIcons: Record<string, typeof CreditCard> = {
  visa: SiVisa as unknown as typeof CreditCard,
  mastercard: SiMastercard as unknown as typeof CreditCard,
  amex: SiAmericanexpress as unknown as typeof CreditCard,
};

export function CardBrandBadge({ brand }: { brand: string | null }) {
  if (!brand) {
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs">
        <CreditCard className="w-3 h-3 mr-1" />
        Unknown
      </Badge>
    );
  }

  const normalizedBrand = brand.toLowerCase();
  const Icon = cardBrandIcons[normalizedBrand] || CreditCard;

  const brandColors: Record<string, string> = {
    visa: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    mastercard: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    amex: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    discover: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };

  const colorClass = brandColors[normalizedBrand] || "bg-slate-500/20 text-slate-300 border-slate-500/30";

  return (
    <Badge variant="outline" className={`${colorClass} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {brand.charAt(0).toUpperCase() + brand.slice(1)}
    </Badge>
  );
}

const countryFlags: Record<string, string> = {
  us: "🇺🇸",
  gb: "🇬🇧",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  it: "🇮🇹",
  nl: "🇳🇱",
  be: "🇧🇪",
  au: "🇦🇺",
  ca: "🇨🇦",
  jp: "🇯🇵",
  sg: "🇸🇬",
  ie: "🇮🇪",
  ch: "🇨🇭",
  at: "🇦🇹",
  se: "🇸🇪",
  no: "🇳🇴",
  dk: "🇩🇰",
  fi: "🇫🇮",
  nz: "🇳🇿",
  pt: "🇵🇹",
  pl: "🇵🇱",
  cz: "🇨🇿",
  mx: "🇲🇽",
  br: "🇧🇷",
  in: "🇮🇳",
};

export function CountryBadge({ countryCode }: { countryCode: string | null }) {
  if (!countryCode) {
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs">
        <Globe className="w-3 h-3 mr-1" />
        Unknown
      </Badge>
    );
  }

  const code = countryCode.toLowerCase();
  const flag = countryFlags[code] || null;

  return (
    <Badge variant="outline" className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">
      {flag ? (
        <span className="mr-1">{flag}</span>
      ) : (
        <Globe className="w-3 h-3 mr-1" />
      )}
      {countryCode.toUpperCase()}
    </Badge>
  );
}

type GhostStatus = "pending" | "nudged" | "recovered" | "protected" | "exhausted";

interface StatusConfig {
  label: string;
  icon: typeof AlertTriangle;
  className: string;
}

const statusConfigs: Record<GhostStatus, StatusConfig> = {
  pending: {
    label: "Pending",
    icon: AlertTriangle,
    className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  nudged: {
    label: "Nudged",
    icon: Zap,
    className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  recovered: {
    label: "Recovered",
    icon: Shield,
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  protected: {
    label: "Protected",
    icon: Shield,
    className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  exhausted: {
    label: "Exhausted",
    icon: AlertTriangle,
    className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  },
};

export function StatusBadge({ status, emailCount = 0 }: { status: GhostStatus; emailCount?: number }) {
  const effectiveStatus = status === "pending" && emailCount > 0 ? "nudged" : status;
  const config = statusConfigs[effectiveStatus] || statusConfigs.pending;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} text-xs`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

type AttributionType = "organic" | "pulse" | "phantom" | null;

export function AttributionBadge({ type }: { type: AttributionType }) {
  if (!type || type === "organic") {
    return (
      <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs">
        Organic
      </Badge>
    );
  }

  if (type === "phantom") {
    return (
      <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
        <Zap className="w-3 h-3 mr-1" />
        PHANTOM
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">
      <RefreshCw className="w-3 h-3 mr-1" />
      Pulse
    </Badge>
  );
}
