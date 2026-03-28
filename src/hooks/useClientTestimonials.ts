import { getUserFromToken } from "@/lib/auth/auth-utils";
import { TestimonialsResponse } from "@/types/testimonials-type";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface UseClientTestimonialsProps {
  status?: "all" | "read" | "unread";
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useClientTestimonials(
  token: string,
  {
    status = "all",
    page = 1,
    limit = 10,
    enabled = true,
  }: UseClientTestimonialsProps = {},
) {
  const user = getUserFromToken(token);
  const clientId = user?.id;

  return useQuery<TestimonialsResponse>({
    queryKey: ["client-testimonials", status, page, limit, clientId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientId) params.append("clientId", clientId);
      if (status !== "all") params.append("status", status);
      params.append("page", page.toString());
      params.append("limit", limit.toString());

      const { data } = await axios.get(
        `/api/external/testimonials?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data;
    },
    enabled: !!clientId && enabled,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });
}
