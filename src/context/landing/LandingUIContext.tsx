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

const THEME_STORAGE_KEY = "marysoll_theme";

export function LandingUIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState("");

  // Restore the saved theme (or OS preference if none saved) on mount.
  // SSR-safe: state starts "light" so server/client initial render match;
  // this runs only on the client, after hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") {
        setTheme(stored);
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        setTheme("dark");
      }
    } catch {
      /* localStorage nedostupan (npr. privatni mod) — ostavi default */
    }
  }, []);

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
        toggleTheme: () =>
          setTheme((t) => {
            const next = t === "dark" ? "light" : "dark";
            // Persist only explicit user choice — kad nema sačuvanog, mount
            // efekat prati OS preferenciju.
            try {
              localStorage.setItem(THEME_STORAGE_KEY, next);
            } catch {
              /* ignore */
            }
            return next;
          }),
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
