import { useQuery } from "@tanstack/react-query";
import { platformClient } from "@/lib/api/platformClient";
import { PlatformCategory } from "@/types/category-types";

export function useCategories() {
  return useQuery<PlatformCategory[]>({
    queryKey: ["categories"],
    queryFn: () => platformClient.getCategories(),
    staleTime: 1000 * 60 * 60, // 1 sat
    refetchOnWindowFocus: false,
  });
}
