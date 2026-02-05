// src/hooks/useSalonProfile.ts
import { useQuery } from "@tanstack/react-query";

export function useSalonProfile() {
  return useQuery({
    queryKey: ["salon-profile"],
    queryFn: async () => {
      const res = await fetch("/api/external/salon-profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      const { data } = await res.json();
      const profile = data;
      return profile;
    },
    staleTime: 1000 * 60 * 60,
  });
}
