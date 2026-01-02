import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Settings, DollarSign, LogOut, Clock, Shield, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMerchant } from "@/context/MerchantContext";
import { useMerchantStats } from "@/hooks/use-merchant-stats";
import { useToast } from "@/hooks/use-toast";
import { useScanJob } from "@/hooks/use-scan-job";

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  description: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, description: "The Audit" },
  { label: "Recoveries", path: "/recoveries", icon: DollarSign, description: "The Action" },
  { label: "Settings", path: "/settings", icon: Settings, description: "The Control Plane" },
];

function formatCurrency(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function SidebarNavItem({ item, isActive, showIndicator }: { item: NavItem; isActive: boolean; showIndicator?: boolean }) {
  const { state } = useSidebar();
  const Icon = item.icon;
  const isCollapsed = state === "collapsed";

  const button = (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      className={isActive ? "bg-white/10 text-white" : "text-slate-400"}
    >
      <Link href={item.path}>
        <div className="relative">
          <Icon className="w-4 h-4 shrink-0" />
          {showIndicator && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
          )}
        </div>
        <span className={`transition-opacity duration-150 ${isCollapsed ? "opacity-0 w-0" : "opacity-100"}`}>
          {item.label}
        </span>
        {showIndicator && !isCollapsed && (
          <span className="ml-auto text-xs text-emerald-400">ON</span>
        )}
      </Link>
    </SidebarMenuButton>
  );

  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" className="bg-slate-900 border-white/10">
            <div>
              <p className="font-medium text-white">{item.label}</p>
              <p className="text-xs text-slate-400">{item.description}</p>
              {showIndicator && (
                <p className="text-xs text-emerald-400 mt-1">Auto-Pilot ON</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }

  return <SidebarMenuItem data-testid={`nav-${item.label.toLowerCase()}`}>{button}</SidebarMenuItem>;
}

function AppSidebar() {
  const [location] = useLocation();
  const { state } = useSidebar();
  const { isAuthenticated, merchant } = useMerchant();
  const isCollapsed = state === "collapsed";
  const autoPilotEnabled = merchant?.autoPilotEnabled ?? false;

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-white/10 bg-obsidian">
      <SidebarHeader className="p-4">
        <Link href="/">
          <div
            className="flex items-center gap-2 cursor-pointer"
            data-testid="nav-logo"
          >
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className={`text-lg font-semibold tracking-tight text-white transition-opacity duration-150 overflow-hidden whitespace-nowrap ${isCollapsed ? "opacity-0 w-0" : "opacity-100"}`}>
              PHANTOM
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarNavItem
                  key={item.path}
                  item={item}
                  isActive={location === item.path}
                  showIndicator={item.path === "/settings" && autoPilotEnabled}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        {isAuthenticated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isCollapsed ? "icon" : "default"}
                onClick={handleLogout}
                className="w-full text-slate-400 hover:text-white justify-start gap-2"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className={`transition-opacity duration-150 ${isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100"}`}>
                  Logout
                </span>
              </Button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="bg-slate-900 border-white/10">
                Logout
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function GlobalHeader() {
  const { merchant } = useMerchant();
  const { stats } = useMerchantStats();
  const { toast } = useToast();
  const { startScan, status: scanStatus, progress, isScanning, error: scanError } = useScanJob();

  useEffect(() => {
    if (scanStatus === "completed") {
      toast({
        title: "Scan Complete",
        description: "Your financial data has been refreshed.",
      });
    } else if (scanStatus === "failed" && scanError) {
      toast({
        title: "Scan Failed",
        description: scanError,
        variant: "destructive",
      });
    }
  }, [scanStatus, scanError, toast]);

  const isArmed = merchant?.autoPilotEnabled || false;
  const volumeGuarded = stats?.grossInvoicedCents || 0;
  const activeLeakage = stats?.lifetime?.allTimeLeakedCents || 0;
  const revenueSaved = (stats?.lifetime?.totalRecoveredCents || 0) + (stats?.totalProtectedCents || 0);
  const lastAudit = stats?.lastAuditAt || null;

  return (
    <header className="h-12 border-b border-white/10 bg-obsidian/95 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between px-4 gap-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="text-slate-400 hover:text-white" data-testid="button-sidebar-toggle" />
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span 
            className="text-sm font-bold text-white tabular-nums"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-volume-guarded"
          >
            {formatEuro(volumeGuarded)}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">Guarded</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isArmed ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
          <span className={`text-xs font-medium ${isArmed ? "text-emerald-400" : "text-slate-500"}`} data-testid="text-sentinel-status">
            {isArmed ? "Sentinel Active" : "Standby"}
          </span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span 
            className="text-sm font-bold text-red-400/80 tabular-nums"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-active-leakage"
          >
            {formatEuro(activeLeakage)}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">Leakage</span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-slate-400 hover:text-white min-w-[4rem]"
          onClick={() => startScan()}
          disabled={isScanning}
          data-testid="button-refresh-audit"
        >
          {isScanning ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {progress}%
              </span>
            </span>
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <span 
            className="text-sm font-bold text-emerald-400 tabular-nums"
            style={{ 
              fontFamily: "JetBrains Mono, monospace",
              textShadow: "0 0 8px rgba(16, 185, 129, 0.3)"
            }}
            data-testid="text-revenue-saved"
          >
            {formatEuro(revenueSaved)}
          </span>
          <span className="text-xs text-emerald-500/70 hidden sm:inline">Saved</span>
        </div>
        
        <div className="flex items-center gap-1 text-slate-500">
          <Clock className="w-3 h-3" />
          <span className="text-xs tabular-nums" data-testid="text-last-audit">
            {formatRelativeTime(lastAudit)}
          </span>
        </div>
      </div>
    </header>
  );
}

export default function MainLayout({ children }: { children: ReactNode }) {
  const sidebarStyle = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle} defaultOpen={true}>
      <div className="flex h-screen w-full bg-obsidian text-slate-200 font-sans">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <GlobalHeader />
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
