import { useState, useMemo } from "react";
import { useMerchant } from "@/context/MerchantContext";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Ghost, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface GhostTarget {
  id: string;
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  discoveredAt: string;
  lastEmailedAt: string | null;
  emailCount: number;
  status: string;
  recoveredAt: string | null;
  recoveryType: string | null;
  declineType: string | null;
  recoveryStrategy: string | null;
  clickCount: number;
  lastClickedAt: string | null;
}

function getStatusBadge(status: string, emailCount: number) {
  switch (status) {
    case "recovered":
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Recovered</Badge>;
    case "exhausted":
      return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Exhausted</Badge>;
    case "pending":
      if (emailCount > 0) {
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Emailed ({emailCount})</Badge>;
      }
      return <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getAttributionBadge(recoveryType: string | null) {
  if (!recoveryType) return null;
  
  if (recoveryType === "direct") {
    return <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-600/30">Direct</Badge>;
  }
  return <Badge className="bg-slate-600/20 text-slate-400 border-slate-600/30">Organic</Badge>;
}

function getRecoveryStrategyBadge(strategy: string | null) {
  if (!strategy) return <span className="text-slate-600">-</span>;
  
  switch (strategy) {
    case "technical_bridge":
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">3DS Bridge</Badge>;
    case "smart_retry":
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Smart Retry</Badge>;
    case "card_refresh":
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Card Refresh</Badge>;
    case "high_value_manual":
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">VIP Manual</Badge>;
    default:
      return <Badge variant="outline" className="text-slate-400">{strategy}</Badge>;
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getLastAction(ghost: GhostTarget): { label: string; date: string; color: string } {
  if (ghost.status === "recovered" && ghost.recoveredAt) {
    return { label: "Recovered", date: formatShortDate(ghost.recoveredAt), color: "text-emerald-400" };
  }
  if (ghost.lastClickedAt) {
    return { label: "Clicked", date: formatShortDate(ghost.lastClickedAt), color: "text-amber-400" };
  }
  if (ghost.lastEmailedAt) {
    return { label: "Emailed", date: formatShortDate(ghost.lastEmailedAt), color: "text-blue-400" };
  }
  return { label: "Discovered", date: formatShortDate(ghost.discoveredAt), color: "text-slate-500" };
}

function GhostLedgerSkeleton() {
  return (
    <div className="min-h-[500px] space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-9 flex-1 max-w-sm bg-slate-800/50 rounded-md animate-slow-pulse" />
      </div>
      <div className="bg-slate-900/50 border border-white/5 rounded-md overflow-hidden">
        <div className="h-12 bg-slate-800/30 border-b border-white/5" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 border-b border-white/5 flex items-center px-4 gap-4">
            <div className="h-4 w-32 bg-slate-800/50 rounded animate-slow-pulse" />
            <div className="h-4 w-40 bg-slate-800/50 rounded animate-slow-pulse" />
            <div className="h-4 w-20 bg-slate-800/50 rounded animate-slow-pulse" />
            <div className="h-4 w-24 bg-slate-800/50 rounded animate-slow-pulse" />
            <div className="h-5 w-16 bg-slate-800/50 rounded animate-slow-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GhostLedger() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  const ghostsQuery = useQuery<GhostTarget[]>({
    queryKey: ["/api/merchant/ghosts"],
  });

  const filteredGhosts = useMemo(() => {
    if (!ghostsQuery.data) return [];
    
    let filtered = ghostsQuery.data;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ghost => 
        ghost.email.toLowerCase().includes(query) ||
        ghost.customerName.toLowerCase().includes(query) ||
        ghost.invoiceId.toLowerCase().includes(query)
      );
    }

    if (sortAsc) {
      return [...filtered].sort((a, b) => 
        new Date(a.discoveredAt).getTime() - new Date(b.discoveredAt).getTime()
      );
    }
    
    return filtered;
  }, [ghostsQuery.data, searchQuery, sortAsc]);

  if (ghostsQuery.isLoading) {
    return <GhostLedgerSkeleton />;
  }

  if (ghostsQuery.error) {
    return (
      <div className="min-h-[500px] flex items-center justify-center text-red-400">
        Failed to load ghost targets
      </div>
    );
  }

  if (!ghostsQuery.data || ghostsQuery.data.length === 0) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center text-center">
        <Ghost className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">No ghost users detected yet.</p>
        <p className="text-sm text-slate-500 mt-2">Run a Deep Harvest audit to identify payment failures.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[500px] space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search by email, name, or invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-900 border-white/10 text-slate-200 placeholder:text-slate-500"
            data-testid="input-ghost-search"
          />
        </div>
        <span className="text-sm text-slate-500">
          {filteredGhosts.length} of {ghostsQuery.data.length} records
        </span>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-slate-400">Customer</TableHead>
              <TableHead className="text-slate-400">Email</TableHead>
              <TableHead className="text-slate-400">Amount</TableHead>
              <TableHead className="text-slate-400">Invoice</TableHead>
              <TableHead className="text-slate-400">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-slate-400 hover:text-white"
                  onClick={() => setSortAsc(!sortAsc)}
                  data-testid="button-sort-date"
                >
                  Discovered
                  <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Strategy</TableHead>
              <TableHead className="text-slate-400">Last Action</TableHead>
              <TableHead className="text-slate-400">Attribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredGhosts.map((ghost) => (
              <TableRow 
                key={ghost.id} 
                className="border-white/5 hover:bg-white/[0.02]"
                data-testid={`row-ghost-${ghost.id}`}
              >
                <TableCell className="text-slate-200">{ghost.customerName}</TableCell>
                <TableCell className="text-slate-400 text-sm">{ghost.email}</TableCell>
                <TableCell 
                  className={ghost.status === "recovered" ? "text-emerald-500" : "text-slate-400"}
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {formatCurrency(ghost.amount)}
                </TableCell>
                <TableCell 
                  className="text-slate-500 text-xs"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {ghost.invoiceId.slice(0, 20)}...
                </TableCell>
                <TableCell className="text-slate-500 text-sm">
                  {formatDate(ghost.discoveredAt)}
                </TableCell>
                <TableCell>
                  {getStatusBadge(ghost.status, ghost.emailCount)}
                </TableCell>
                <TableCell>
                  {getRecoveryStrategyBadge(ghost.recoveryStrategy)}
                </TableCell>
                <TableCell className="text-sm">
                  {(() => {
                    const action = getLastAction(ghost);
                    return (
                      <span className={action.color}>
                        {action.label} {action.date && <span className="text-slate-600">{action.date}</span>}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {getAttributionBadge(ghost.recoveryType)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function RecoveriesPage() {
  const { merchant, isLoading, isAuthenticated, authLoading } = useMerchant();

  if (authLoading || isLoading) {
    return <GhostLedgerSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 mb-4">Please connect your Stripe account to view recoveries.</p>
        <Link href="/">
          <Button variant="outline" className="border-white/10" data-testid="link-dashboard">
            Go to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const formatCurrencyHero = (cents: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-2">Forensic Attribution Ledger</h1>
          <p className="text-slate-400">Complete itemization of detected ghost users and recovery status.</p>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-slate-500 mb-1">Total Recovered</p>
          <p 
            className="text-2xl text-emerald-500"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
            data-testid="text-recoveries-total"
          >
            {formatCurrencyHero(merchant?.lifetime?.totalRecoveredCents ?? 0)}
          </p>
        </div>
      </div>

      <GhostLedger />
    </div>
  );
}
