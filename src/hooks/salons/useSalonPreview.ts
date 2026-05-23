import { useQuery } from "@tanstack/react-query";
import type { SalonPreview } from "@/types/salon-preview";

export function useSalonPreview(slug: string) {
  return useQuery<SalonPreview>({
    queryKey: ["salon-preview", slug],
    queryFn: async () => {
      const response = await fetch(`/api/salons/${encodeURIComponent(slug)}`);
      if (!response.ok) {
        throw new Error("Salon nije pronađen");
      }
      return response.json() as Promise<SalonPreview>;
    },
    enabled: Boolean(slug),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
