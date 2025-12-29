import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

interface MonthlyTrendPoint {
  month: string;
  leaked: number;
  recovered: number;
}

interface DailyPulsePoint {
  date: string;
  leaked: number;
  recovered: number;
}

interface LifetimeStats {
  allTimeLeakedCents: number;
  totalGhostCount: number;
  totalRecoveredCents: number;
}

interface MerchantStats {
  id: string;
  lastAuditAt: string | null;
  tierLimit: number;
  recoveryStrategy: string;
  lifetime: LifetimeStats;
  monthlyTrend: MonthlyTrendPoint[];
  dailyPulse: DailyPulsePoint[];
}

interface AuthStatus {
  authenticated: boolean;
  merchantId?: string;
}

interface MerchantContextType {
  merchant: MerchantStats | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const authQuery = useQuery<AuthStatus>({
    queryKey: ["/api/auth/status"],
  });

  const statsQuery = useQuery<MerchantStats>({
    queryKey: ["/api/merchant/stats"],
    enabled: authQuery.data?.authenticated === true,
  });

  const isAuthenticated = authQuery.data?.authenticated === true;
  const authLoading = authQuery.isLoading;

  return (
    <MerchantContext.Provider
      value={{
        merchant: statsQuery.data ?? null,
        isLoading: statsQuery.isLoading,
        isAuthenticated,
        authLoading,
        error: statsQuery.error as Error | null,
        refetch: statsQuery.refetch,
      }}
    >
      {children}
    </MerchantContext.Provider>
  );
}

export function useMerchant() {
  const context = useContext(MerchantContext);
  if (context === undefined) {
    throw new Error("useMerchant must be used within a MerchantProvider");
  }
  return context;
}

export type { MerchantStats, LifetimeStats, MonthlyTrendPoint, DailyPulsePoint };
