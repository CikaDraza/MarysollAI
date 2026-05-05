"use client";

import { useState, useRef, FormEvent } from "react";
import { SparklesIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ParsedIntent } from "@/types/intent";

export interface ConversationalSearchParams {
  city?: string;
  category?: string;
  subcategory?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number;
  timeWindowEnd?: number;
}

interface Props {
  onSearch: (params: ConversationalSearchParams) => void;
  defaultCity?: string;
}

const EXAMPLES = [
  "treba mi šišanje večeras",
  "masaža sutra poslepodne",
  "nokti u Novom Sadu posle 15h",
  "hitno trebaju mi obrve danas",
  "tretman lica oko 14 časova",
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

function buildInterpretation(intent: ParsedIntent, defaultCity: string): string {
  const parts: string[] = [];

  if (intent.categoryKey) {
    parts.push(CAT_LABELS[intent.categoryKey] ?? intent.categoryKey);
  }

  const city = intent.city ?? defaultCity;
  if (city) parts.push(`u ${city}`);

  if (intent.date) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    if (intent.date === today) parts.push("danas");
    else if (intent.date === tomorrow) parts.push("sutra");
    else {
      const [, mo, dd] = intent.date.split("-");
      parts.push(`${dd}.${mo}.`);
    }
  }

  if (intent.timeRange.from) {
    const to = intent.timeRange.to;
    parts.push(to ? `${intent.timeRange.from}–${to}` : `posle ${intent.timeRange.from}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "slobodni termini";
}

const URGENT_LABEL: Record<string, string> = {
  urgent_booking: "Hitna pretraga",
  inspiration: "Istraživanje",
  price_check: "Pregled cena",
  salon_discovery: "Pronalaženje salona",
  availability_search: "",
};

export default function ConversationalSearch({ onSearch, defaultCity = "Srbija" }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [intentBadge, setIntentBadge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate through placeholder examples
  const exampleRef = useRef(Math.floor(Math.random() * EXAMPLES.length));

  function reset() {
    setQuery("");
    setInterpretation(null);
    setIntentBadge(null);
    setError(null);
    inputRef.current?.focus();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setInterpretation(null);
    setIntentBadge(null);

    try {
      const res = await fetch(`/api/search/intent?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`intent ${res.status}`);
      const intent = await res.json() as ParsedIntent;

      setInterpretation(buildInterpretation(intent, defaultCity));

      const badge = URGENT_LABEL[intent.intentType];
      if (badge) setIntentBadge(badge);

      // Derive time params from AI intent
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

      onSearch({
        city: intent.city ?? undefined,
        category: intent.categoryKey ?? undefined,
        subcategory: intent.subcategoryKey ?? undefined,
        date: intent.date ?? undefined,
        time,
        timeWindowStart,
        timeWindowEnd,
      });
    } catch {
      setError("Nešto nije u redu. Pokušaj ponovo.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!query.trim() && !loading;

  return (
    <section style={{ marginTop: 56 }}>
      {/* Header row */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <SparklesIcon
          style={{ width: 18, height: 18, color: "var(--secondary-color)", flexShrink: 0 }}
          strokeWidth={1.5}
        />
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--fg-1)",
            margin: 0,
          }}
        >
          Pitaj Mariju
        </p>
        <span
          style={{
            fontFamily: "var(--main-font)",
            fontSize: 12,
            color: "var(--fg-3)",
          }}
        >
          — opiši šta ti treba
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--surface)",
            border: "1.5px solid var(--brand-100)",
            borderRadius: 20,
            padding: "10px 10px 10px 18px",
            boxShadow: "var(--shadow-sm)",
            transition: "border-color var(--dur-fast) var(--ease-out)",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={EXAMPLES[exampleRef.current]}
            disabled={loading}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "var(--main-font)",
              fontWeight: 500,
              fontSize: 15,
              color: "var(--fg-1)",
              minWidth: 0,
            }}
          />

          {query && !loading && (
            <button
              type="button"
              onClick={reset}
              aria-label="Obriši"
              style={{
                background: "none",
                border: "none",
                padding: 6,
                cursor: "pointer",
                color: "var(--fg-3)",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <XMarkIcon style={{ width: 15, height: 15 }} />
            </button>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 18px",
              borderRadius: 14,
              background: canSubmit ? "var(--secondary-color)" : "var(--surface-2)",
              color: canSubmit ? "#fff" : "var(--fg-3)",
              transition:
                "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
              flexShrink: 0,
              opacity: loading ? 0.75 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? (
              <>
                <span style={spinnerStyle} />
                Tražim...
              </>
            ) : (
              <>
                <MagnifyingGlassIcon style={{ width: 14, height: 14 }} strokeWidth={2} />
                Pretraži
              </>
            )}
          </button>
        </div>
      </form>

      {/* Interpretation + intent badge */}
      {(interpretation || intentBadge) && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
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
              <SparklesIcon style={{ width: 11, height: 11 }} strokeWidth={2} />
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
        </div>
      )}

      {error && (
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#dc2626",
            fontFamily: "var(--main-font)",
          }}
        >
          {error}
        </p>
      )}

      <style>{`@keyframes _cs_spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 13,
  height: 13,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  animation: "_cs_spin 0.7s linear infinite",
};
