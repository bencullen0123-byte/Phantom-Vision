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

interface MerchantContextType {
  merchant: MerchantStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export function MerchantProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery<MerchantStats>({
    queryKey: ["/api/merchant/stats"],
  });

  return (
    <MerchantContext.Provider
      value={{
        merchant: data ?? null,
        isLoading,
        error: error as Error | null,
        refetch,
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
