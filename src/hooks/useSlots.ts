// src/hooks/useSlots.ts
import { useQuery } from "@tanstack/react-query";
import type { MappedSlot } from "@/lib/mappers/salonMapper";

interface UseSlotsParams {
  salonId: string;
  date?: string;
}

export function useSlots({ salonId, date }: UseSlotsParams) {
  const today = new Date().toISOString().split("T")[0];
  const resolvedDate = date ?? today;

  return useQuery<MappedSlot[]>({
    queryKey: ["slots", salonId, resolvedDate],
    queryFn: async () => {
      const qs = new URLSearchParams({ salonId, date: resolvedDate });
      const res = await fetch(`/api/slots?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch slots");
      const all = (await res.json()) as MappedSlot[];
      return all
        .filter((s) => s.isAvailable)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    enabled: !!salonId,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });
}
