import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiPaths } from "@carelens/shared";
import { apiFetch } from "../lib/api";

export interface ScanRecord {
  id: string;
  modelId: string;
  status: string;
  clinicalContext?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ScansResponse {
  scans: ScanRecord[];
  counts: { total: number; completed: number; failed: number };
}

/** The signed-in clinician's saved scans (server-scoped to the user). */
export function useScans() {
  return useQuery({
    queryKey: ["scans"],
    queryFn: () => apiFetch<ScansResponse>(apiPaths.scans),
  });
}

/**
 * Client-side search across the saved-scans index. Real data only — there is no
 * server-side search endpoint, so this filters the user's own scan list.
 */
export function useScansSearch(query: string): {
  results: ScanRecord[];
  isLoading: boolean;
} {
  const { data, isLoading } = useScans();
  const needle = query.trim().toLowerCase();

  const results = useMemo(() => {
    const scans = data?.scans ?? [];
    if (needle.length < 2) return [];
    return scans
      .filter((scan) => {
        const contextText = scan.clinicalContext
          ? Object.values(scan.clinicalContext).join(" ")
          : "";
        const haystack = `${scan.id} ${scan.modelId} ${scan.status} ${scan.createdAt} ${contextText}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 8);
  }, [data, needle]);

  return { results, isLoading };
}