import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { IAppointment } from "@/types/appointments-type";

interface UseAppointmentsProps {
  page?: number;
  limit?: number;
  date?: string;
  clientId?: string;
  clientEmail?: string;
  search?: string;
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
  {
    page = 1,
    limit = 10,
    date = "",
    clientId = "",
    clientEmail = "",
    search = "",
    enabled = true,
  }: UseAppointmentsProps = {},
) {
  return useQuery<AppointmentsResponse>({
    queryKey: [
      "appointments-client",
      token,
      page,
      limit,
      date,
      clientId,
      clientEmail,
      search,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (date) params.append("date", date);
      if (clientId) params.append("clientId", clientId);
      if (clientEmail) params.append("clientEmail", clientEmail);
      if (search) params.append("search", search);

      const { data } = await axios.get(
        `/api/external/appointments?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return data;
    },
    enabled: !!token && enabled,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });
}
