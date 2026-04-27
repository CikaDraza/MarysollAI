"use client";

import Link from "next/link";
import Logo from "./Logo";
import { useState, useRef, useEffect } from "react";
import {
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
  MapPinIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useAuthActions } from "@/hooks/useAuthActions";
import { SERBIAN_CITIES } from "@/lib/cities";

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenAI: () => void;
  onLogin: () => void;
  city: string;
  onCityChange: (cityName: string) => void;
}

export default function LandingHeader({
  theme,
  onToggleTheme,
  onOpenAI,
  onLogin,
  city,
  onCityChange,
}: Props) {
  const { user, logout } = useAuthActions();

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
          <CityPill city={city} onChange={onCityChange} />
        </div>

        {user ? (
          <UserButton user={user} onLogout={logout} />
        ) : (
          <button
            className="lh-login"
            onClick={onLogin}
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
        )}

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

/* ── City pill with dropdown ────────────────────────────────────────────────── */

function CityPill({ city, onChange }: { city: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: open ? "var(--brand-100)" : "var(--surface-2)",
          border: "none",
          borderRadius: 12,
          padding: "9px 12px",
          fontFamily: "var(--main-font)",
          fontWeight: 600,
          fontSize: 13,
          color: open ? "var(--secondary-color)" : "var(--fg-1)",
          cursor: "pointer",
          transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-100)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-color)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-1)";
          }
        }}
      >
        <MapPinIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
        {city}
        <ChevronDownIcon
          style={{
            width: 12,
            height: 12,
            flexShrink: 0,
            transition: "transform 150ms",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            background: "var(--surface)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
            minWidth: 190,
            overflow: "hidden",
            zIndex: 100,
            border: "1px solid var(--border-1, rgba(0,0,0,.07))",
          }}
        >
          {SERBIAN_CITIES.map((c) => {
            const isSelected = c.name === city;
            return (
              <button
                key={c.name}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: isSelected ? "var(--brand-100, #f3e8ff)" : "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--main-font)",
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 13,
                  color: isSelected ? "var(--secondary-color)" : "var(--fg-1)",
                  transition: "background var(--dur-fast)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "999px",
                      background: "var(--secondary-color)",
                      flexShrink: 0,
                    }}
                  />
                )}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── User avatar button + dropdown ─────────────────────────────────────────── */

function UserButton({
  user,
  onLogout,
}: {
  user: { name: string; email?: string };
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const firstName = user.name.split(" ")[0];
  const initials = user.name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }} className="lh-login">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 12,
          padding: "7px 12px 7px 7px",
          borderRadius: 10,
          background: "var(--brand-100, #f3e8ff)",
          color: "var(--secondary-color)",
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-200, #e9d5ff)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-100, #f3e8ff)";
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "999px",
            background: "var(--secondary-color)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: ".03em",
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
        {firstName}
        <ChevronDownIcon
          style={{
            width: 12,
            height: 12,
            transition: "transform 150ms",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "var(--surface)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
            minWidth: 200,
            overflow: "hidden",
            zIndex: 100,
            border: "1px solid var(--border-1, rgba(0,0,0,.07))",
          }}
        >
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--border-1, rgba(0,0,0,.07))",
            }}
          >
            <p
              style={{
                margin: "0 0 2px",
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--fg-1)",
              }}
            >
              {user.name}
            </p>
            {user.email && (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--main-font)",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--fg-3)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </p>
            )}
          </div>

          <button
            onClick={() => {
              onLogout();
              setOpen(false);
            }}
            style={{
              display: "flex",
              width: "100%",
              padding: "12px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--fg-2)",
              textAlign: "left",
              transition: "background var(--dur-fast), color var(--dur-fast)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-1)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-2)";
            }}
          >
            Odjavi se
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Static pill ────────────────────────────────────────────────────────────── */

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
