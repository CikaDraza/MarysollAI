"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  MapPinIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { ParsedIntent } from "@/types/intent";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useCityContext } from "@/context/landing/CityContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import { useWorkspace } from "@/context/landing/WorkspaceContext";
import { SERBIAN_CITIES } from "@/lib/cities";
import { normalizeSearchIntent } from "@/lib/search/normalizeSearchIntent";
import { buildSearchRoute, composeRoute } from "@/lib/search/buildSearchRoute";
import { cityLocative } from "@/lib/seo/cityGrammar";
import TrustRow from "./TrustRow";

export interface SearchParams {
  city: string;
  category: string;
  date: string;
  time?: string;
  subcategory?: string;
  query?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
}

const PLACEHOLDERS = [
  "Treba mi masaža večeras",
  "Manikir sutra poslepodne",
  "Šišanje Beograd danas",
  "Hitno trebaju mi obrve",
  "Tretman lica oko 14h",
  "Nokti posle 15h u Novom Sadu",
];

const CAT_LABELS: Record<string, string> = {
  massage: "masaža",
  nails: "nokti",
  hair: "šišanje / kosa",
  makeup: "šminka",
  waxing: "depilacija",
  eyebrows: "obrve",
  facial: "tretman lica",
  body: "oblikovanje tela",
};

const INTENT_BADGE: Record<string, string> = {
  urgent_booking: "Hitno",
  inspiration: "Istraživanje",
  price_check: "Cene",
  salon_discovery: "Saloni",
  availability_search: "",
};

function buildInterpretation(
  intent: ParsedIntent,
  defaultCity: string,
): string {
  const parts: string[] = [];

  if (intent.categoryKey) {
    parts.push(CAT_LABELS[intent.categoryKey] ?? intent.categoryKey);
  }

  const city = intent.city ?? defaultCity;
  if (city) parts.push(`u ${city}`);

  if (intent.date) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (intent.date === today) parts.push("danas");
    else if (intent.date === tomorrow) parts.push("sutra");
    else {
      const [, mo, dd] = intent.date.split("-");
      parts.push(`${dd}.${mo}.`);
    }
  }

  if (intent.timeRange.from) {
    const to = intent.timeRange.to;
    parts.push(
      to ? `${intent.timeRange.from}–${to}` : `posle ${intent.timeRange.from}`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "slobodni termini";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface HeroCopy {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export default function Hero({ eyebrow, title, subtitle }: HeroCopy = {}) {
  const { setDrawerOpen } = useLandingUI();
  const { cityName, setCity, geoLoading, requestGpsLocation, geoSource } =
    useCityContext();
  const router = useRouter();
  const pathname = usePathname();
  const {
    setCategory,
    setDateFilter,
    setTimeFilter,
    setSubcategoryFilter,
    setTimeWindowStart,
    setTimeWindowEnd,
    searchQuery,
    setSearchQuery,
    resetSearchFilters,
    applySearchSuggestion,
  } = useFilters();
  const { suggestions } = useSearchContext();
  const { dismissWorkspace } = useWorkspace();

  const defaultCity = cityName;
  // Show the city in the hero H1 only for an explicitly-chosen city
  // (manual / route / search). Auto-GPS/saved stays the neutral hero.
  const showCityInHero = geoSource === "explicit" && Boolean(cityName);
  const onOpenAI = () => setDrawerOpen(true);
  const onSearch = useCallback(
    (params: SearchParams) => {
      dismissWorkspace();
      if (params.city) {
        const found = SERBIAN_CITIES.find(
          (x) => x.name.toLowerCase() === params.city.toLowerCase(),
        );
        if (found) setCity(found);
      }
      setCategory(params.category);
      setSearchQuery(params.query ?? params.subcategory ?? "");
      setDateFilter(params.date || undefined);
      setTimeFilter(params.time);
      setSubcategoryFilter(params.subcategory);
      setTimeWindowStart(params.timeWindowStart ?? undefined);
      setTimeWindowEnd(params.timeWindowEnd ?? undefined);
    },
    [
      dismissWorkspace,
      setCity,
      setCategory,
      setDateFilter,
      setTimeFilter,
      setSubcategoryFilter,
      setTimeWindowStart,
      setTimeWindowEnd,
      setSearchQuery,
    ],
  );
  const [value, setValue] = useState(searchQuery);
  const [focused, setFocused] = useState(false);
  const [placeholderIdx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterp] = useState<string | null>(null);
  const [intentBadge, setIntentBadge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(searchQuery);
  }, [searchQuery]);

  // Rotate placeholder every ~3 s
  useEffect(() => {
    const id = setInterval(
      () => setIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3200,
    );
    return () => clearInterval(id);
  }, []);

  const submit = useCallback(async () => {
    const q = value.trim();
    if (!q || loading) {
      if (!q) resetSearchFilters();
      return;
    }

    setLoading(true);
    setError(null);
    setInterp(null);
    setIntentBadge(null);

    // Intent routing: a query that names (or contextually implies) a city
    // navigates to its SEO-canonical route. Only an explicitly-chosen city
    // (manual/route/search) acts as context — auto/GPS never drives routing.
    // The route is the single source of truth: a new city/category must change
    // the URL, never just client state.
    const contextCity = geoSource === "explicit" ? cityName : undefined;
    const currentSearch =
      typeof window !== "undefined" ? window.location.search : "";
    const currentTarget = `${pathname}${currentSearch}`;

    const localRoute = buildSearchRoute(q, contextCity);
    if (localRoute && localRoute.path !== currentTarget) {
      router.push(localRoute.path);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/search/intent?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`intent ${res.status}`);
      const intent = (await res.json()) as ParsedIntent;

      console.log("[🤖 AI Intent]", JSON.stringify(intent, null, 2));
      setInterp(buildInterpretation(intent, defaultCity));
      const badge = INTENT_BADGE[intent.intentType];
      if (badge) setIntentBadge(badge);

      let time: string | undefined;
      let timeWindowStart: number | undefined;
      let timeWindowEnd: number | undefined;

      if (intent.timeRange.from) {
        time = intent.timeRange.from;
        timeWindowStart = parseInt(intent.timeRange.from.split(":")[0], 10);
        if (intent.timeRange.to) {
          timeWindowEnd = parseInt(intent.timeRange.to.split(":")[0], 10);
        }
      }

      // The AI may resolve a city the local parser missed. If that yields a
      // different canonical route, navigate instead of mutating client state —
      // so URL/metadata/canonical/H1 never drift from the visible results.
      const apiRoute = composeRoute(
        {
          city: intent.city,
          category: intent.categoryKey,
          date: intent.date === tomorrowStr() ? "tomorrow" : null,
          afterHour:
            intent.timeRange.from && !intent.timeRange.to
              ? parseInt(intent.timeRange.from.split(":")[0], 10)
              : null,
        },
        contextCity,
      );
      if (apiRoute && apiRoute.path !== currentTarget) {
        router.push(apiRoute.path);
        setLoading(false);
        return;
      }

      onSearch({
        city: intent.city ?? "",
        category: intent.categoryKey ?? "",
        date: intent.date ?? todayStr(),
        time,
        subcategory: intent.subcategoryKey ?? undefined,
        query: q,
        timeWindowStart,
        timeWindowEnd,
      });

      document
        .getElementById("quick-access")
        ?.scrollIntoView({ behavior: "smooth" });
    } catch {
      const fallbackIntent = normalizeSearchIntent({ rawQuery: q, city: defaultCity });
      setSearchQuery(q);
      onSearch({
        city: "",
        category: fallbackIntent.categoryKey ?? "",
        date: todayStr(),
        subcategory: fallbackIntent.shouldSearchCategoryBucket ? undefined : q,
        query: q,
      });
      setInterp(
        fallbackIntent.canonicalCategory
          ? `${fallbackIntent.canonicalCategory} u ${defaultCity}`
          : `Pretraga: ${q}`,
      );
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [
    value,
    loading,
    defaultCity,
    onSearch,
    resetSearchFilters,
    setSearchQuery,
    geoSource,
    cityName,
    pathname,
    router,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void submit();
  };

  const handleInputChange = (next: string) => {
    setValue(next);
    if (next === "") {
      setInterp(null);
      setIntentBadge(null);
      setError(null);
      resetSearchFilters();
    }
  };

  const handleGeo = async () => {
    const result = await requestGpsLocation({ promoteToExplicit: true });
    if (!result.ok) {
      toast.error(
        result.reason === "denied"
          ? "Lokacija nije dozvoljena. Izaberi grad ručno."
          : "Ne možemo da očitamo lokaciju. Izaberi grad ručno.",
      );
      inputRef.current?.focus();
      return;
    }
    if (result.isApproximate) {
      toast("Lokacija je približna. Možeš ručno izabrati grad.");
    }
    inputRef.current?.focus();
  };

  const canSubmit = !!value.trim() && !loading;

  return (
    <>
      <style>{`
        .hero-smart-wrap {
          position: relative; width: 100%; max-width: 680px; margin: 0 auto;
        }
        .hero-smart-pill {
          display: flex; align-items: center; gap: 0;
          background: var(--surface); border-radius: 999px;
          box-shadow: var(--shadow-md);
          transition: box-shadow var(--dur-fast) var(--ease-out);
          overflow: visible; padding: 6px 6px 6px 20px;
        }
        .hero-smart-pill.focused { box-shadow: 0 0 0 3px var(--brand-200), var(--shadow-md); }
        .hero-smart-input {
          flex: 1; border: none; outline: none; background: transparent;
          font-family: var(--main-font); font-weight: 500; font-size: 15px;
          color: var(--fg-1); padding: 10px 0; min-width: 0;
        }
        .hero-smart-input::placeholder { color: var(--fg-3); }
        .hero-smart-icon-left {
          flex-shrink: 0; display: flex; align-items: center;
          color: var(--secondary-color); margin-right: 10px;
        }
        .hero-smart-geo {
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border: none; background: transparent; cursor: pointer;
          color: var(--fg-3); border-radius: 999px;
          transition: color var(--dur-fast), background var(--dur-fast); margin-right: 4px;
        }
        .hero-smart-geo:hover { color: var(--secondary-color); background: var(--brand-50); }
        .hero-smart-geo:disabled { opacity: 0.4; cursor: not-allowed; }
        .hero-smart-btn {
          flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
          gap: 6px; border: none; cursor: pointer; font-family: var(--main-font);
          font-weight: 700; font-size: 14px; padding: 10px 22px; border-radius: 999px;
          background: var(--secondary-color); color: #fff;
          transition: background var(--dur-fast) var(--ease-out); white-space: nowrap;
        }
        .hero-smart-btn:hover:not(:disabled) { background: var(--secondary-hover); }
        .hero-smart-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .hero-intent-chips {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          justify-content: left; margin-top: 12px; min-height: 28px;
        }
        .hero-cta-row {
          display: flex; gap: 16px; align-items: center; justify-content: center;
          flex-wrap: wrap; margin-top: 20px;
        }
        @keyframes _hero_spin { to { transform: rotate(360deg); } }
        @media (max-width: 520px) {
          .hero-smart-pill { padding: 5px 5px 5px 16px; }
          .hero-smart-btn  { padding: 10px 16px; font-size: 13px; }
          .hero-cta-row    { flex-direction: column; gap: 8px; }
        }
      `}</style>

      <section
        style={{
          position: "relative",
          zIndex: 1,
          padding: "72px 24px 20px",
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
            {eyebrow ?? "Marysoll · Novi Sad · Beograd · Niš · Bor"}
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
            {title ? (
              title
            ) : (
              <>
                Slobodni termini
                <br />u {showCityInHero ? cityLocative(cityName) : "salonima"}{" "}
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
              </>
            )}
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
            {subtitle ??
              "Pronađi masažu, tretman ili šišanje u svom gradu i rezerviši odmah — bez poziva, bez čekanja."}
          </p>
          <div className="mb-16">
            <TrustRow />
          </div>

          {/* Booking concierge input */}
          <div className="hero-smart-wrap">
            <div
              className={`hero-smart-pill${focused ? " focused" : ""}`}
              role="search"
            >
              <span className="hero-smart-icon-left" aria-hidden="true">
                {loading ? (
                  <span style={spinnerStyle} />
                ) : (
                  <MagnifyingGlassIcon
                    style={{ width: 18, height: 18 }}
                    strokeWidth={2}
                  />
                )}
              </span>

              <input
                ref={inputRef}
                type="text"
                className="hero-smart-input"
                placeholder={PLACEHOLDERS[placeholderIdx]}
                value={value}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 120)}
                onKeyDown={handleKeyDown}
                aria-label="Pretraži termine"
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
              />

              <button
                className="hero-smart-geo"
                onClick={handleGeo}
                aria-label="Koristi moju lokaciju"
                title="Koristi moju lokaciju"
                disabled={geoLoading || loading}
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

              <button
                className="hero-smart-btn"
                onClick={() => void submit()}
                disabled={!canSubmit}
                suppressHydrationWarning
              >
                {loading ? (
                  "Tražim..."
                ) : (
                  <>
                    <MagnifyingGlassIcon
                      style={{ width: 15, height: 15 }}
                      strokeWidth={2.5}
                    />
                    Pretraži
                  </>
                )}
              </button>
            </div>

            {/* Parsed intent chips */}
            {(interpretation || intentBadge || error) && (
              <div className="hero-intent-chips">
                {interpretation && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "var(--brand-50, #fdf4ff)",
                      border: "1px solid var(--brand-100)",
                      borderRadius: 10,
                      padding: "4px 12px",
                      fontFamily: "var(--main-font)",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--secondary-color)",
                    }}
                  >
                    <SparklesIcon
                      style={{ width: 11, height: 11 }}
                      strokeWidth={2}
                    />
                    {interpretation}
                  </span>
                )}
                {intentBadge && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: "var(--surface-2)",
                      borderRadius: 10,
                      padding: "4px 10px",
                      fontFamily: "var(--main-font)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--fg-3)",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                    }}
                  >
                    {intentBadge}
                  </span>
                )}
                {error && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "#dc2626",
                      fontFamily: "var(--main-font)",
                    }}
                  >
                    {error}
                  </span>
                )}
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="hero-intent-chips" style={{ marginTop: 12 }}>
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.label}-${suggestion.reason}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      applySearchSuggestion(suggestion);
                      if (suggestion.city) {
                        const found = SERBIAN_CITIES.find(
                          (x) => x.name.toLowerCase() === suggestion.city!.toLowerCase(),
                        );
                        if (found) setCity(found);
                      }
                      document
                        .getElementById("booking-widget")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      background: "var(--surface)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontFamily: "var(--main-font)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--fg-2)",
                      cursor: "pointer",
                    }}
                  >
                    {suggestion.label}
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
                transition:
                  "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--secondary-hover)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--brand-50)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--secondary-color)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              <SparklesIcon
                style={{ width: 18, height: 18 }}
                strokeWidth={1.5}
              />
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

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2.5px solid rgba(93,1,86,0.2)",
  borderTopColor: "var(--secondary-color)",
  animation: "_hero_spin 0.7s linear infinite",
  flexShrink: 0,
};
