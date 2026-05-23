import { useQuery } from "@tanstack/react-query";
import type { SalonTestimonialsResponse } from "@/types/salon-preview";

export function useSalonTestimonials(slug: string, enabled = true) {
  return useQuery<SalonTestimonialsResponse>({
    queryKey: ["salon-testimonials", slug],
    queryFn: async () => {
      const response = await fetch(
        `/api/salons/${encodeURIComponent(slug)}/testimonials`,
      );
      if (!response.ok) {
        throw new Error("Utisci nisu dostupni");
      }
      return response.json() as Promise<SalonTestimonialsResponse>;
    },
    enabled: Boolean(slug) && enabled,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
}
