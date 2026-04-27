"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MagnifyingGlassIcon, MapPinIcon, SparklesIcon } from "@heroicons/react/24/outline";

export interface SearchParams {
  city: string;
  category: string;
  date: string;
  time?: string;
}

interface Props {
  onSearch: (params: SearchParams) => void;
  onOpenAI: () => void;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const PLACEHOLDERS = [
  "Novi Sad masaža danas",
  "Manikir sutra u 15h",
  "Šišanje Beograd večeras",
  "Treba mi masaža",
  "Tretman lica Niš",
];

const CITIES = [
  "Novi Sad", "Beograd", "Niš", "Bor", "Kragujevac",
  "Subotica", "Zrenjanin", "Pančevo", "Čačak", "Leskovac",
];
const CITY_LOWER = CITIES.map((c) => c.toLowerCase());

const SERVICE_MAP: [string, string][] = [
  ["masaž",    "massage"],
  ["manikir",  "nails"],
  ["nokt",     "nails"],
  ["pedikir",  "nails"],
  ["gel nokt", "nails"],
  ["akril",    "nails"],
  ["šišanj",   "hair"],
  ["frizur",   "hair"],
  ["šmink",    "makeup"],
  ["depilacij","waxing"],
  ["obrv",     "eyebrows"],
  ["trepavic", "eyebrows"],
  ["tretman",  "facial"],
];

const ALL_SUGGESTIONS = [
  ...CITIES,
  "Masaža", "Manikir", "Nokti", "Frizure", "Šminka",
  "Šišanje", "Depilacija", "Tretman lica",
  "Danas", "Sutra", "Večeras", "Jutros",
];

/* ── Helpers ────────────────────────────────────────────────────────────── */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseInput(raw: string): SearchParams {
  const lower = raw.toLowerCase();

  let date = todayStr();
  if (lower.includes("prekosutra")) date = offsetDateStr(2);
  else if (lower.includes("sutra")) date = offsetDateStr(1);

  let time: string | undefined;
  const timeMatch = lower.match(/u\s*(\d{1,2})(?::(\d{2}))?h?/) ?? lower.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, "0");
    const m = timeMatch[2] ?? "00";
    time = `${h}:${m}`;
  }

  let city = "";
  for (let i = 0; i < CITY_LOWER.length; i++) {
    if (lower.includes(CITY_LOWER[i])) { city = CITIES[i]; break; }
  }

  let category = "";
  for (const [key, cat] of SERVICE_MAP) {
    if (lower.includes(key)) { category = cat; break; }
  }

  return { city, category, date, time };
}

function getSuggestions(input: string): string[] {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  const words = trimmed.split(/\s+/);
  const last = words[words.length - 1].toLowerCase();
  if (last.length < 2) return [];
  return ALL_SUGGESTIONS
    .filter((s) => s.toLowerCase().startsWith(last) || s.toLowerCase().includes(last))
    .slice(0, 5);
}

function applySuggestion(current: string, suggestion: string): string {
  const words = current.split(/\s+/);
  words[words.length - 1] = suggestion;
  return words.join(" ");
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Hero({ onSearch, onOpenAI }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [geoLoading, setGeoLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Rotate placeholder
  useEffect(() => {
    const id = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3200,
    );
    return () => clearInterval(id);
  }, []);

  // Update suggestions on value change
  useEffect(() => {
    setSuggestions(value.length >= 2 ? getSuggestions(value) : []);
    setActiveSuggestion(-1);
  }, [value]);

  // Close suggestions on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const submit = useCallback(() => {
    const params = parseInput(value);
    onSearch(params);
    setSuggestions([]);
  }, [value, onSearch]);

  const pickSuggestion = useCallback((s: string) => {
    const next = applySuggestion(value, s);
    setValue(next);
    setSuggestions([]);
    setActiveSuggestion(-1);
    inputRef.current?.focus();
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && activeSuggestion >= 0)) {
        e.preventDefault();
        pickSuggestion(suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]);
        return;
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        return;
      }
    }
    if (e.key === "Enter") submit();
  };

  const handleGeo = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setGeoLoading(false);
        // Placeholder — reverse geocode can be wired later
        if (!value.toLowerCase().includes("novi sad") && !value.toLowerCase().includes("beograd")) {
          setValue((v) => (v ? v + " " : "") + "Novi Sad");
        }
        inputRef.current?.focus();
      },
      () => setGeoLoading(false),
      { timeout: 6000 },
    );
  };

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <>
      <style>{`
        .hero-smart-wrap {
          position: relative;
          width: 100%;
          max-width: 680px;
          margin: 0 auto;
        }
        .hero-smart-pill {
          display: flex;
          align-items: center;
          gap: 0;
          background: var(--surface);
          border-radius: 999px;
          box-shadow: var(--shadow-md);
          transition: box-shadow var(--dur-fast) var(--ease-out);
          overflow: visible;
          padding: 6px 6px 6px 20px;
        }
        .hero-smart-pill.focused {
          box-shadow: 0 0 0 3px var(--brand-200), var(--shadow-md);
        }
        .hero-smart-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--main-font);
          font-weight: 500;
          font-size: 15px;
          color: var(--fg-1);
          padding: 10px 0;
          min-width: 0;
        }
        .hero-smart-input::placeholder { color: var(--fg-3); }
        .hero-smart-icon-left {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          color: var(--secondary-color);
          margin-right: 10px;
        }
        .hero-smart-geo {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--fg-3);
          border-radius: 999px;
          transition: color var(--dur-fast), background var(--dur-fast);
          margin-right: 4px;
        }
        .hero-smart-geo:hover { color: var(--secondary-color); background: var(--brand-50); }
        .hero-smart-btn {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: none;
          cursor: pointer;
          font-family: var(--main-font);
          font-weight: 700;
          font-size: 14px;
          padding: 10px 22px;
          border-radius: 999px;
          background: var(--secondary-color);
          color: #fff;
          transition: background var(--dur-fast) var(--ease-out);
          white-space: nowrap;
        }
        .hero-smart-btn:hover { background: var(--secondary-hover); }
        .hero-suggestions {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: var(--surface);
          border-radius: 18px;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          z-index: 20;
        }
        .hero-suggestion-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 18px;
          font-family: var(--main-font);
          font-size: 14px;
          font-weight: 500;
          color: var(--fg-1);
          cursor: pointer;
          transition: background var(--dur-fast);
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }
        .hero-suggestion-item:hover,
        .hero-suggestion-item.active { background: var(--surface-2); }
        .hero-cta-row {
          display: flex;
          gap: 16px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 20px;
        }
        @media (max-width: 520px) {
          .hero-smart-pill { padding: 5px 5px 5px 16px; }
          .hero-smart-btn { padding: 10px 16px; font-size: 13px; }
          .hero-cta-row { flex-direction: column; gap: 8px; }
        }
      `}</style>

      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "72px 24px 80px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {/* Eyebrow */}
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--secondary-color)",
              margin: "0 0 14px",
            }}
          >
            Marysoll · Novi Sad · Beograd · Niš · Bor
          </p>

          <h1
            style={{
              fontFamily: "var(--display-font)",
              fontWeight: 400,
              fontSize: "clamp(36px, 6.4vw, 72px)",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              margin: "0 0 18px",
              color: "var(--fg-1)",
            }}
          >
            Slobodni termini<br />
            u salonima{" "}
            <span
              style={{
                fontFamily: "var(--heading-font)",
                fontWeight: 400,
                color: "var(--secondary-color)",
                paddingLeft: 8,
              }}
            >
              danas
            </span>
          </h1>

          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 400,
              fontSize: "clamp(16px, 2.2vw, 19px)",
              lineHeight: 1.5,
              color: "var(--fg-2)",
              margin: "0 auto 32px",
              maxWidth: 580,
            }}
          >
            Pronađi masažu, tretman ili šišanje u svom gradu i rezerviši odmah — bez poziva, bez čekanja.
          </p>

          {/* Unified smart input */}
          <div ref={containerRef} className="hero-smart-wrap">
            <div className={`hero-smart-pill${focused ? " focused" : ""}`} role="search">
              <span className="hero-smart-icon-left" aria-hidden="true">
                <MagnifyingGlassIcon style={{ width: 18, height: 18 }} strokeWidth={2} />
              </span>

              <input
                ref={inputRef}
                type="text"
                className="hero-smart-input"
                placeholder={PLACEHOLDERS[placeholderIdx]}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 120)}
                onKeyDown={handleKeyDown}
                aria-label="Pretraži termine"
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                autoComplete="off"
                spellCheck={false}
              />

              <button
                className="hero-smart-geo"
                onClick={handleGeo}
                aria-label="Koristi moju lokaciju"
                title="Koristi moju lokaciju"
                disabled={geoLoading}
              >
                <MapPinIcon
                  style={{
                    width: 18,
                    height: 18,
                    opacity: geoLoading ? 0.4 : 1,
                    transition: "opacity 200ms",
                  }}
                  strokeWidth={1.5}
                />
              </button>

              <button className="hero-smart-btn" onClick={submit}>
                <MagnifyingGlassIcon style={{ width: 15, height: 15 }} strokeWidth={2.5} />
                Pretraži
              </button>
            </div>

            {/* Suggestions */}
            {showSuggestions && (
              <div className="hero-suggestions" role="listbox">
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    className={`hero-suggestion-item${i === activeSuggestion ? " active" : ""}`}
                    role="option"
                    aria-selected={i === activeSuggestion}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  >
                    <MagnifyingGlassIcon
                      style={{ width: 14, height: 14, color: "var(--fg-3)", flexShrink: 0 }}
                      strokeWidth={2}
                    />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Secondary CTA row */}
          <div className="hero-cta-row">
            <button
              onClick={onOpenAI}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 16,
                padding: "14px 20px",
                borderRadius: 14,
                color: "var(--secondary-color)",
                transition: "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-hover)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-50)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-color)";
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <SparklesIcon style={{ width: 18, height: 18 }} strokeWidth={1.5} />
              Pitaj asistenta
            </button>
            <span
              style={{
                fontFamily: "var(--main-font)",
                fontWeight: 500,
                fontSize: 14,
                color: "var(--fg-3)",
              }}
            >
              ili izaberi kategoriju ispod
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
