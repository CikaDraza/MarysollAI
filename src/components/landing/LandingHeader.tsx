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
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useCityContext } from "@/context/landing/CityContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { useAIContext } from "@/context/landing/AIContext";

export default function LandingHeader() {
  const { theme, toggleTheme, setDrawerOpen } = useLandingUI();
  const { cityName, setCityByName } = useCityContext();
  const { closeModal } = useBookingModal();
  const { sendMessage } = useAIContext();
  const { user, logout } = useAuthActions();

  const handleLoginRequest = () => {
    closeModal();
    setDrawerOpen(true);
    sendMessage("Prijavi se");
  };

  const onToggleTheme = toggleTheme;
  const onOpenAI = () => setDrawerOpen(true);
  const onLogin = handleLoginRequest;
  const city = cityName;
  const onCityChange = setCityByName;

  return (
    <header className="flex items-center gap-2 bg-[var(--surface)] rounded-[22px] px-[14px] py-[10px] shadow-[var(--shadow-sm)]">
      <Link href="/" className="flex items-center shrink-0">
        <Logo width={120} />
      </Link>

      <div className="flex-1" />

      <button
        className="inline-flex [@media(max-width:520px)]:hidden w-9 h-9 rounded-full border-0 bg-[var(--surface-2)] text-[var(--fg-2)] cursor-pointer items-center justify-center transition-[background,color] hover:bg-[var(--brand-100)] hover:text-[var(--secondary-color)]"
        onClick={onToggleTheme}
        aria-label="Promeni temu"
      >
        {theme === "dark" ? (
          <SunIcon className="w-[18px] h-[18px]" />
        ) : (
          <MoonIcon className="w-[18px] h-[18px]" />
        )}
      </button>

      <div className="contents max-sm:hidden">
        <Pill>
          SR <ChevronDownIcon className="w-3 h-3" />
        </Pill>
        <CityPill city={city} onChange={onCityChange} />
      </div>

      {user ? (
        <UserButton user={user} onLogout={logout} />
      ) : (
        <button
          className="inline-flex [@media(max-width:520px)]:hidden items-center justify-center gap-2 border-0 cursor-pointer font-bold text-[12px] px-[14px] py-[9px] rounded-[10px] bg-[var(--secondary-color)] text-white shadow-[var(--shadow-brand)] transition-[background] hover:bg-[var(--secondary-hover)]"
          style={{ fontFamily: "var(--main-font)" }}
          onClick={onLogin}
        >
          Login
        </button>
      )}

      <button
        onClick={onOpenAI}
        className="inline-flex items-center gap-[6px] bg-transparent border-0 cursor-pointer text-[var(--secondary-color)] font-bold text-[13px] px-[10px] py-2 rounded-[10px] shrink-0 transition-colors hover:text-[var(--secondary-hover)]"
        style={{ fontFamily: "var(--main-font)" }}
      >
        <SparklesIcon className="w-4 h-4" />
        <span className="inline [@media(max-width:520px)]:hidden">Pitaj Mariju</span>
      </button>
    </header>
  );
}

/* ── City pill with dropdown ────────────────────────────────────────────────── */

function CityPill({
  city,
  onChange,
}: {
  city: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-[6px] border-0 rounded-[12px] px-3 py-[9px] font-semibold text-[13px] cursor-pointer transition-[background,color] whitespace-nowrap hover:bg-[var(--brand-100)] hover:text-[var(--secondary-color)] ${
          open
            ? "bg-[var(--brand-100)] text-[var(--secondary-color)]"
            : "bg-[var(--surface-2)] text-[var(--fg-1)]"
        }`}
        style={{ fontFamily: "var(--main-font)" }}
      >
        <MapPinIcon className="w-[14px] h-[14px] shrink-0" />
        {city}
        <ChevronDownIcon
          className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+8px)] left-0 bg-[var(--surface)] rounded-[16px] shadow-[var(--shadow-lg)] min-w-[190px] overflow-hidden z-[100] border border-[var(--border-1)]"
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
                className={`flex items-center gap-2 w-full text-left px-[14px] py-[10px] border-0 cursor-pointer text-[13px] transition-[background] ${
                  isSelected
                    ? "bg-[var(--brand-100,#f3e8ff)] font-bold text-[var(--secondary-color)]"
                    : "bg-transparent font-medium text-[var(--fg-1)] hover:bg-[var(--surface-2)]"
                }`}
                style={{ fontFamily: "var(--main-font)" }}
              >
                {isSelected && (
                  <span className="w-[6px] h-[6px] rounded-full bg-[var(--secondary-color)] shrink-0" />
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
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
    <div ref={ref} className="relative inline-flex [@media(max-width:520px)]:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-[7px] border-0 cursor-pointer font-bold text-[12px] py-[7px] pr-3 pl-[7px] rounded-[10px] bg-[var(--brand-100,#f3e8ff)] text-[var(--secondary-color)] transition-[background] hover:bg-[var(--brand-200,#e9d5ff)]"
        style={{ fontFamily: "var(--main-font)" }}
      >
        <span className="w-[22px] h-[22px] rounded-full bg-[var(--secondary-color)] text-white inline-flex items-center justify-center text-[9px] font-extrabold tracking-[.03em] shrink-0">
          {initials}
        </span>
        {firstName}
        <ChevronDownIcon
          className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 bg-[var(--surface)] rounded-[16px] shadow-[var(--shadow-lg)] min-w-[200px] overflow-hidden z-[100] border border-[var(--border-1)]">
          <div className="px-4 pt-[14px] pb-3 border-b border-[var(--border-1)]">
            <p
              className="mb-[2px] mt-0 font-bold text-[13px] text-[var(--fg-1)]"
              style={{ fontFamily: "var(--main-font)" }}
            >
              {user.name}
            </p>
            {user.email && (
              <p
                className="m-0 text-[11px] font-medium text-[var(--fg-3)] overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontFamily: "var(--main-font)" }}
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
            className="flex w-full px-4 py-3 bg-transparent border-0 cursor-pointer font-semibold text-[13px] text-[var(--fg-2)] text-left transition-[background,color] hover:bg-[var(--surface-2)] hover:text-[var(--fg-1)]"
            style={{ fontFamily: "var(--main-font)" }}
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
  return (
    <button
      className="inline-flex items-center gap-[6px] bg-[var(--surface-2)] hover:bg-[var(--brand-100)] border-0 rounded-[12px] px-3 py-[9px] font-semibold text-[13px] text-[var(--fg-1)] cursor-pointer transition-[background]"
      style={{ fontFamily: "var(--main-font)" }}
    >
      {children}
    </button>
  );
}
