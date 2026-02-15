import { useQuery, useQueryClient } from "@tanstack/react-query";

const DRAWER_KEY = ["drawer-state"];

interface DrawerState {
  isOpen: boolean;
  prompt: string;
}

export function useDrawer() {
  const queryClient = useQueryClient();

  const { data } = useQuery<DrawerState>({
    queryKey: DRAWER_KEY,
    queryFn: () => ({ isOpen: false, prompt: "" }),
    staleTime: Infinity,
    initialData: { isOpen: false, prompt: "" },
  });

  const openDrawer = (initialPrompt?: string) => {
    queryClient.setQueryData(DRAWER_KEY, {
      isOpen: true,
      prompt: initialPrompt || "",
    });
  };

  const closeDrawer = () => {
    queryClient.setQueryData(DRAWER_KEY, (prev: DrawerState) => ({
      ...prev,
      isOpen: false,
    }));
  };

  // Novi seter za prompt
  const setDrawerPrompt = (newPrompt: string) => {
    queryClient.setQueryData(DRAWER_KEY, (prev: DrawerState) => ({
      ...prev,
      prompt: newPrompt,
    }));
  };

  return {
    isOpen: data?.isOpen ?? false,
    prompt: data?.prompt ?? "",
    openDrawer,
    closeDrawer,
    setDrawerPrompt, // Izvezi funkciju
  };
}
