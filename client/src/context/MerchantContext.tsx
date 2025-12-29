import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

interface MerchantStats {
  id: string;
  lastAuditAt: string | null;
  totalRecoveredCents: number;
  allTimeLeakedCents: number;
  totalGhostCount: number;
  tierLimit: number;
  recoveryStrategy: string;
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
