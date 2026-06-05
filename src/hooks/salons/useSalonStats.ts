import { useQuery } from "@tanstack/react-query";
import type { SalonStats } from "@/lib/salons/tenantStats";

export function useSalonStats(tenantId: string | undefined, enabled = true) {
  return useQuery<SalonStats | null>({
    queryKey: ["salon-stats", tenantId],
    queryFn: async () => {
      const res = await fetch(
        `/api/salons/stats?tenantId=${encodeURIComponent(tenantId!)}`,
      );
      if (!res.ok) return null;
      return res.json() as Promise<SalonStats | null>;
    },
    enabled: Boolean(tenantId) && enabled,
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}
