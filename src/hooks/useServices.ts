import { IService } from "@/types/services-type";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface ServiceProps {
  query?: string;
  salonId?: string;
}

export function useServices({ query = "", salonId }: ServiceProps) {
  return useQuery<IService[]>({
    queryKey: ["services", salonId ?? "", query],
    queryFn: async () => {
      if (!salonId) return [];
      const { data } = await axios.get("/api/external/services", {
        params: { salonId, query: query || undefined },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!salonId,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
}
