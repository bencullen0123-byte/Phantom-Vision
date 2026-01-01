import { useQuery } from "@tanstack/react-query";

export interface MerchantStats {
  id: string;
  lastAuditAt: string | null;
  tierLimit: number;
  recoveryStrategy: string;
  lifetime: {
    allTimeLeakedCents: number;
    totalGhostCount: number;
    totalRecoveredCents: number;
  };
  defaultCurrency: string;
  impendingLeakageCents: number;
  totalProtectedCents: number;
  monthlyTrend: { month: string; leaked: number; recovered: number }[];
  dailyPulse: { date: string; leaked: number; recovered: number }[];
}

export function useMerchantStats() {
  const query = useQuery<MerchantStats>({
    queryKey: ["/api/merchant/stats"],
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
