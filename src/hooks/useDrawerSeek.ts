// hooks/useDrawer.ts
import { useCallback, useSyncExternalStore } from "react";

interface DrawerState {
  isOpen: boolean;
  type: "chat" | "settings" | null;
}

const INITIAL_STATE: DrawerState = {
  isOpen: false,
  type: null,
};

let listeners: (() => void)[] = [];
let drawerState: DrawerState = { ...INITIAL_STATE };

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const getServerSnapshot = () => INITIAL_STATE;

export const useDrawerSeek = () => {
  const state = useSyncExternalStore(
    (onStoreChange) => {
      listeners.push(onStoreChange);
      return () => {
        listeners = listeners.filter((l) => l !== onStoreChange);
      };
    },
    () => drawerState,
    getServerSnapshot,
  );

  const openDrawer = useCallback((type: DrawerState["type"] = "chat") => {
    drawerState = { isOpen: true, type };
    emitChange();
  }, []);

  const closeDrawer = useCallback(() => {
    drawerState = { isOpen: false, type: null };
    emitChange();
  }, []);

  const toggleDrawer = useCallback((type?: DrawerState["type"]) => {
    if (drawerState.isOpen && drawerState.type === type) {
      drawerState = { isOpen: false, type: null };
    } else {
      drawerState = { isOpen: true, type: type ?? "chat" };
    }
    emitChange();
  }, []);

  return {
    isOpen: state.isOpen,
    type: state.type,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
};
