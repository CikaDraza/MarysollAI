import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { IAppointment } from "@/types/appointments-type";

interface UseAppointmentsProps {
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface AppointmentsResponse {
  appointments: IAppointment[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function useAppointmentsWithToken(
  token: string,
  { page = 1, limit = 10, enabled = true }: UseAppointmentsProps = {},
) {
  return useQuery<AppointmentsResponse>({
    queryKey: ["appointments", page, limit, token],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());

      const { data } = await axios.get(
        `/api/external/appointments?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data;
    },
    enabled: !!token && enabled,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });
}
