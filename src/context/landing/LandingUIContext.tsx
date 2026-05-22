"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { uiCommandBus } from "@/lib/ai/ui/ui-command-executor";

interface LandingUIContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  confirmedTime: string;
  setConfirmedTime: (time: string) => void;
}

const LandingUIContext = createContext<LandingUIContextValue | null>(null);

export function LandingUIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return uiCommandBus.subscribe((command) => {
      if (command.type === "OPEN_DRAWER") {
        setDrawerOpen(true);
        return;
      }
      if (command.type === "CLOSE_DRAWER") {
        setDrawerOpen(false);
        return;
      }
      if (command.type === "SHOW_TOAST") {
        if (command.reason === "workflow_booking_success") {
          toast(
            (t) => (
              <div style={{ position: "relative", paddingRight: 28 }}>
                <strong>{command.message}</strong>
                <button
                  type="button"
                  aria-label="Zatvori"
                  onClick={() => toast.dismiss(t.id)}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: -2,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--fg-3)",
                    padding: 2,
                  }}
                >
                  <XMarkIcon style={{ width: 16, height: 16 }} strokeWidth={2} />
                </button>
              </div>
            ),
            { duration: Infinity },
          );
          return;
        }
        if (command.variant === "success") toast.success(command.message);
        else if (command.variant === "error") toast.error(command.message);
        else toast(command.message);
      }
    });
  }, []);

  return (
    <LandingUIContext.Provider
      value={{
        theme,
        toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        drawerOpen,
        setDrawerOpen,
        confirmed,
        setConfirmed,
        confirmedTime,
        setConfirmedTime,
      }}
    >
      {children}
    </LandingUIContext.Provider>
  );
}

export function useLandingUI() {
  const ctx = useContext(LandingUIContext);
  if (!ctx) throw new Error("useLandingUI must be used within LandingUIProvider");
  return ctx;
}
