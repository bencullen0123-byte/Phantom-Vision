import { useQuery } from "@tanstack/react-query";

interface ActiveScanResponse {
  active: boolean;
  jobId?: number;
  progress?: number;
  status?: string;
  createdAt?: string;
}

export function useActiveScan() {
  return useQuery<ActiveScanResponse>({
    queryKey: ["/api/scan/active"],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.active ? 2000 : false;
    },
    staleTime: 1000,
  });
}
