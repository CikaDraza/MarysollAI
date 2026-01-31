// hooks/useAppointments.ts
import { PaginationInfo } from "@/types";
import { IAppointment } from "@/types/appointments-type";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";

interface AppointmentsResponse {
  appointments: IAppointment[];
  pagination: PaginationInfo;
}

interface UseAppointmentsProps {
  page?: number;
  limit?: number;
  search?: string;
  date?: string;
  status?: string;
}

export function useAppointments({
  page = 1,
  limit = 10,
  search = "",
  date = "",
  status = "all",
}: UseAppointmentsProps = {}) {
  const hasFilters = !!search || !!date;

  return useQuery<AppointmentsResponse>({
    queryKey: ["appointments", page, limit, search, date, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== "all") params.append("status", status);
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (search) params.append("search", search);
      if (date) params.append("date", date);

      const { data } = await axios.get(
        `/api/external/appointments?${params.toString()}`,
      );
      return data;
    },
    placeholderData: keepPreviousData,

    // OPTIMALNE POSTAVKE:
    refetchInterval: hasFilters ? false : 10000, // 10s polling samo bez filtera
    refetchOnWindowFocus: !hasFilters, // Focus refetch samo bez filtera
    refetchOnMount: !hasFilters, // Mount refetch samo bez filtera
    refetchOnReconnect: true, // Uvek refetch na reconnect

    // Cache optimizacije
    staleTime: hasFilters ? 0 : 30000, // 30s bez filtera
    gcTime: 1000 * 60 * 5, // 5 minuta cache
  });
}
