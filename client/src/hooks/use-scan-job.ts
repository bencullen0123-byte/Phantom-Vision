import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ScanStatus = "idle" | "pending" | "processing" | "completed" | "failed";

interface ScanJobState {
  id: number;
  merchantId: string;
  status: ScanStatus;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

interface UseScanJobReturn {
  startScan: () => void;
  status: ScanStatus;
  progress: number;
  error: string | null;
  isScanning: boolean;
  reset: () => void;
}

export function useScanJob(): UseScanJobReturn {
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scan", { forceSync: true });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setJobId(data.jobId);
        setStatus("pending");
        setProgress(0);
        setError(null);
      }
    },
    onError: (err: Error) => {
      setStatus("failed");
      setError(err.message);
    },
  });

  const shouldPoll = jobId !== null && (status === "pending" || status === "processing");

  const { data: jobData } = useQuery<ScanJobState>({
    queryKey: ["/api/scan", jobId],
    enabled: shouldPoll,
    refetchInterval: shouldPoll ? 1000 : false,
  });

  useEffect(() => {
    if (!jobData) return;

    setStatus(jobData.status as ScanStatus);
    setProgress(jobData.progress);

    if (jobData.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["/api/merchant/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ghosts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diagnostic-pulse"] });
    }

    if (jobData.status === "failed") {
      setError(jobData.error || "Scan failed");
    }
  }, [jobData]);

  const startScan = useCallback(() => {
    if (status === "pending" || status === "processing") return;
    setStatus("pending");
    setProgress(0);
    setError(null);
    startMutation.mutate();
  }, [status, startMutation]);

  const reset = useCallback(() => {
    setJobId(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
  }, []);

  const isScanning = status === "pending" || status === "processing";

  return {
    startScan,
    status,
    progress,
    error,
    isScanning,
    reset,
  };
}
