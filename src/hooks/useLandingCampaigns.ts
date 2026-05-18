import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { INewsletterCampaign } from "@/types";

export function useLandingCampaigns() {
  return useQuery<INewsletterCampaign[]>({
    queryKey: ["landing-campaigns"],
    queryFn: async () => {
      const res = await axios.get("/api/campaigns");
      return res.data;
    },
    // Campaign lists rarely change between page mounts. Without an
    // explicit staleTime, every focus/remount triggers a fresh fetch.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
