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
  });
}
