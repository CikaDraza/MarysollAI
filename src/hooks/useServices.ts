import { IService } from "@/types/services-type";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface ServiceProps {
  query?: string;
}

export function useServices({ query = "" }: ServiceProps) {
  return useQuery<IService[]>({
    queryKey: ["services", query],
    queryFn: async () => {
      const { data } = await axios.get("/api/external/services", {
        params: { query: query || "" },
      });
      return data;
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
}
