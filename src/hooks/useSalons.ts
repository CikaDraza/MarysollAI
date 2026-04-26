// src/hooks/useSalons.ts
import { useQuery } from "@tanstack/react-query";
import type { MappedSalon } from "@/lib/mappers/salonMapper";

export function useSalons(city?: string) {
  return useQuery<MappedSalon[]>({
    queryKey: ["salons", city ?? ""],
    queryFn: async () => {
      const qs = city ? `?city=${encodeURIComponent(city)}` : "";
      const res = await fetch(`/api/salons${qs}`);
      if (!res.ok) throw new Error("Failed to fetch salons");
      return res.json() as Promise<MappedSalon[]>;
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
