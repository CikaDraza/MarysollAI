"use client";

import { useState } from "react";
import { MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/24/outline";

interface Props {
  onSearch: () => void;
  onOpenAI: () => void;
}

export default function Hero({ onSearch, onOpenAI }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <>
      <style>{`
        .hero-search-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .hero-search-btn {
          flex-shrink: 0;
        }
        @media (max-width: 480px) {
          .hero-search-row {
            flex-wrap: wrap;
            padding: 10px 12px !important;
          }
          .hero-search-btn {
            width: 100%;
            justify-content: center;
          }
        }
        .hero-cta-row {
          display: flex;
          gap: 16px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 22px;
        }
        @media (max-width: 480px) {
          .hero-cta-row {
            flex-direction: column;
            gap: 8px;
          }
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
        {/* Content — centered, max-width constrained */}
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
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

          {/* H1 — Abril Fatface body, Berkshire Swash for "danas" */}
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

          {/* Subhead */}
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

          {/* Search bar */}
          <label
            className="hero-search-row"
            style={{
              background: "var(--surface)",
              borderRadius: 20,
              padding: "10px 10px 10px 22px",
              boxShadow: focused
                ? "0 0 0 3px var(--brand-200), var(--shadow-md)"
                : "var(--shadow-md)",
              width: "100%",
              maxWidth: 760,
              margin: "0 auto",
              transition: "box-shadow var(--dur-fast) var(--ease-out)",
              cursor: "text",
            }}
          >
            <MagnifyingGlassIcon
              style={{ width: 20, height: 20, color: "var(--fg-3)", flexShrink: 0 }}
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Otkrijte i rezervišite stručnjake za lepotu i velnes u vašoj blizini"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                border: "none",
                outline: "none",
                flex: 1,
                minWidth: 0,
                fontFamily: "var(--main-font)",
                fontWeight: 400,
                fontSize: 15,
                color: "var(--fg-1)",
                background: "transparent",
                padding: "8px 0",
              }}
            />
            <button
              onClick={onSearch}
              className="hero-search-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 14,
                padding: "12px 18px",
                borderRadius: 14,
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
              Pretraži
            </button>
          </label>

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
                padding: "16px 24px",
                borderRadius: 16,
                color: "var(--secondary-color)",
                transition:
                  "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
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
