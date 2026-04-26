"use client";

import Link from "next/link";
import Logo from "./Logo";
import { useState } from "react";
import {
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
  MapPinIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenAI: () => void;
}

export default function LandingHeader({ theme, onToggleTheme, onOpenAI }: Props) {
  return (
    <>
      <style>{`
        .lh-pills { display: contents; }
        .lh-theme-btn { display: inline-flex !important; }
        .lh-ai-label { display: inline !important; }
        .lh-login { display: inline-flex !important; }

        @media (max-width: 640px) {
          .lh-pills { display: none !important; }
        }
        @media (max-width: 520px) {
          .lh-theme-btn { display: none !important; }
          .lh-login { display: none !important; }
          .lh-ai-label { display: none !important; }
        }
      `}</style>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--surface)",
          borderRadius: 22,
          padding: "10px 14px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Logo width={120} />
        </Link>

        <div style={{ flex: 1 }} />

        <button
          className="lh-theme-btn"
          onClick={onToggleTheme}
          aria-label="Promeni temu"
          style={{
            width: 36,
            height: 36,
            borderRadius: "999px",
            border: "none",
            background: "var(--surface-2)",
            color: "var(--fg-2)",
            cursor: "pointer",
            alignItems: "center",
            justifyContent: "center",
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-100)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-color)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-2)";
          }}
        >
          {theme === "dark"
            ? <SunIcon style={{ width: 18, height: 18 }} />
            : <MoonIcon style={{ width: 18, height: 18 }} />}
        </button>

        <div className="lh-pills">
          <Pill>SR <ChevronDownIcon style={{ width: 12, height: 12 }} /></Pill>
          <Pill>
            <MapPinIcon style={{ width: 14, height: 14 }} />
            Novi Sad
            <ChevronDownIcon style={{ width: 12, height: 12 }} />
          </Pill>
        </div>

        <button
          className="lh-login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 12,
            padding: "9px 14px",
            borderRadius: 10,
            background: "var(--secondary-color)",
            color: "#fff",
            boxShadow: "var(--shadow-brand)",
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-color)";
          }}
        >
          Login
        </button>

        <button
          onClick={onOpenAI}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--secondary-color)",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 10,
            flexShrink: 0,
            transition: "color var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-color)";
          }}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} />
          <span className="lh-ai-label">Pitaj Mariju</span>
        </button>
      </header>
    </>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: hovered ? "var(--brand-100)" : "var(--surface-2)",
        border: "none",
        borderRadius: 12,
        padding: "9px 12px",
        fontFamily: "var(--main-font)",
        fontWeight: 600,
        fontSize: 13,
        color: "var(--fg-1)",
        cursor: "pointer",
        transition: "background var(--dur-fast) var(--ease-out)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}
