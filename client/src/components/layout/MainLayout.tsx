import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Settings, DollarSign, LogOut, Clock, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { apiRequest } from "@/lib/queryClient";
import { useMerchant } from "@/context/MerchantContext";

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

function SidebarNavItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { state } = useSidebar();
  const Icon = item.icon;
  const isCollapsed = state === "collapsed";

  const content = (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      className={isActive ? "bg-white/10 text-white" : "text-slate-400"}
    >
      <Link href={item.path}>
        <Icon className="w-4 h-4" />
        <AnimatePresence>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden whitespace-nowrap"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </SidebarMenuButton>
  );

  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="bg-slate-900 border-white/10">
            <div>
              <p className="font-medium text-white">{item.label}</p>
              <p className="text-xs text-slate-400">{item.description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </SidebarMenuItem>
    );
  }

  return <SidebarMenuItem data-testid={`nav-${item.label.toLowerCase()}`}>{content}</SidebarMenuItem>;
}

function AppSidebar() {
  const [location] = useLocation();
  const { state } = useSidebar();
  const { isAuthenticated } = useMerchant();
  const isCollapsed = state === "collapsed";

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
          <motion.div
            className="flex items-center gap-2 cursor-pointer"
            data-testid="nav-logo"
          >
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-lg font-semibold tracking-tight text-white overflow-hidden whitespace-nowrap"
                >
                  PHANTOM
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
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
                <LogOut className="w-4 h-4" />
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      Logout
                    </motion.span>
                  )}
                </AnimatePresence>
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

function GlobalHeader() {
  const { merchant } = useMerchant();

  const grossVolume = merchant?.grossInvoicedCents ?? 0;
  const currency = merchant?.defaultCurrency ?? "usd";
  const lastAudit = merchant?.lastAuditAt ?? null;

  return (
    <header className="h-14 border-b border-white/10 bg-obsidian/95 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="text-slate-400 hover:text-white" data-testid="button-sidebar-toggle" />
        <div className="h-6 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span className="text-slate-400">Volume Guarded:</span>
          <span 
            className="text-white font-mono font-medium"
            data-testid="text-gross-volume"
          >
            {formatCurrency(grossVolume, currency)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-slate-500">Last Audit:</span>
          <span 
            className="text-slate-300 font-mono"
            data-testid="text-last-audit"
          >
            {formatRelativeTime(lastAudit)}
          </span>
        </div>
        <span 
          className="font-mono text-xs text-slate-500"
          data-testid="text-version"
        >
          v1.0.0
        </span>
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
