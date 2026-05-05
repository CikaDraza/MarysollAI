"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface LandingUIContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}

const LandingUIContext = createContext<LandingUIContextValue | null>(null);

export function LandingUIProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <LandingUIContext.Provider
      value={{
        theme,
        toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        drawerOpen,
        setDrawerOpen,
        confirmed,
        setConfirmed,
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
