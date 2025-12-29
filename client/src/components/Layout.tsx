import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Settings, DollarSign, Terminal } from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Recoveries", path: "/recoveries", icon: DollarSign },
  { label: "Growth", path: "/growth", icon: TrendingUp },
  { label: "System", path: "/system", icon: Terminal },
  { label: "Settings", path: "/settings", icon: Settings },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.path}>
      <span
        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors cursor-pointer ${
          isActive
            ? "bg-white/10 text-white"
            : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
        }`}
        data-testid={`nav-${item.label.toLowerCase()}`}
      >
        <Icon className="w-4 h-4" />
        <span>{item.label}</span>
      </span>
    </Link>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-obsidian text-slate-200 font-sans">
      <nav className="border-b border-white/10 bg-obsidian sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <div className="flex items-center gap-8">
              <Link href="/">
                <span 
                  className="text-xl font-semibold tracking-tight text-white cursor-pointer"
                  data-testid="nav-logo"
                >
                  PHANTOM
                </span>
              </Link>
              
              <div className="flex items-center gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    item={item}
                    isActive={location === item.path}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span 
                className="font-mono text-sm text-slate-400"
                data-testid="text-system-status"
              >
                v1.0.0
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-8">
        {children}
      </main>
    </div>
  );
}
