"use client";

import { useMemo, useState } from "react";
import {
  CheckBadgeIcon,
  MapPinIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";
import type { FlatSlot, SearchResult } from "@/types/slots";
import { useCityContext } from "@/context/landing/CityContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { formatDistance } from "@/lib/utils/distance";
import {
  rankSearchResults,
  type RankedSlot,
} from "@/lib/search/rankSearchResults";
import {
  resolveFallbackPolicy,
  applyFallbackPolicy,
} from "@/lib/availability/fallbackPolicy";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

/** Returns a human-readable section label for a city group. */
function cityGroupLabel(
  city: string,
  userCity: string | undefined,
  fallbackLevel: number,
): string {
  const isUserCity = userCity && city.toLowerCase() === userCity.toLowerCase();

  if (isUserCity) return `Slobodni termini — ${city}`;
  if (fallbackLevel <= 4) return `Bliski gradovi — ${city}`;
  return `Popularno u Srbiji — ${city}`;
}

export default function BookingWidget() {
  const { cityName: userCity, geoResolved } = useCityContext();
  const { results, fallbackLevel, isLoading: loading } = useSearchContext();
  const { openModal: onBook } = useBookingModal();

  // Phase 2.5C Task 2 — unified ranking. Replaces local grouping/sorting
  // with the strategy-aware adapter. Output: 3 city rows × 5 slots/row,
  // diversified per-salon, ordered by the same score-cascade everywhere.
  //
  // Phase 3 — Policy enforcement. BookingWidget is a discovery surface: max L5,
  // allowNearbyCities=true, allowSynthetic=false. Filter applied before ranking
  // so rankSearchResults never sees ineligible candidates.
  const ranked = useMemo(() => {
    const policy = resolveFallbackPolicy("bookingwidget", { kind: "discovery" });
    const eligible = applyFallbackPolicy(results, policy);
    return rankSearchResults({
      slots: eligible,
      strategy: "bookingwidget",
      userLocation:
        geoResolved.lat != null && geoResolved.lng != null
          ? { lat: geoResolved.lat, lng: geoResolved.lng }
          : undefined,
      fallbackLevel,
    });
  }, [results, geoResolved.lat, geoResolved.lng, fallbackLevel]);

  const groupedByCity = ranked.groupedByCity;
  const hasAny = groupedByCity.some((g) => g.slots.length > 0);

  // Compute a friendly subtitle once
  const subtitle = useMemo(() => {
    if (!hasAny || loading) return null;
    const cities = groupedByCity
      .filter((g) => g.slots.length > 0)
      .map((g) => g.city);
    if (cities.length === 0) return null;
    const hasUserCity =
      userCity && cities[0]?.toLowerCase() === userCity.toLowerCase();
    if (hasUserCity) return null; // no extra explanation needed
    // Defer to ranked.fallback.userMessage when expanded, but keep the
    // BookingWidget-specific wording for L4/L5.
    if (fallbackLevel >= 5) return "Prikazujemo termine iz popularnih gradova.";
    if (fallbackLevel >= 4) return "Prikazujemo termine iz gradova u blizini.";
    return null;
  }, [hasAny, loading, groupedByCity, userCity, fallbackLevel]);

  return (
    <section id="booking-widget" style={{ marginTop: 56 }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--secondary-color)",
            margin: "0 0 6px",
          }}
        >
          Slobodni termini
        </p>
        <h2
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: "clamp(28px, 3.6vw, 38px)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            margin: "6px 0 0",
            color: "var(--fg-1)",
          }}
        >
          Zakaži odmah
        </h2>
        {subtitle && (
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              marginTop: 8,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {loading && (
        <div style={gridStyle}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SlotSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !hasAny && (
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 16,
              color: "var(--fg-2)",
              margin: "0 0 8px",
            }}
          >
            Nema termina za ovu uslugu trenutno
          </p>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: 0,
            }}
          >
            Promenite kategoriju, grad ili datum — ili pitajte asistenta.
          </p>
        </div>
      )}

      {!loading &&
        groupedByCity
          .filter((g) => g.slots.length > 0)
          .map((group) => (
            <div key={group.city} style={{ marginBottom: 44 }}>
              <h3
                style={{
                  fontFamily: "var(--main-font)",
                  fontWeight: 700,
                  fontSize: "clamp(16px, 2vw, 20px)",
                  color: "var(--fg-1)",
                  margin: "0 0 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 20,
                    borderRadius: 4,
                    background: "var(--secondary-color)",
                    flexShrink: 0,
                  }}
                />
                {cityGroupLabel(group.city, userCity, fallbackLevel)}
              </h3>

              <div style={gridStyle}>
                {group.slots.map((slot, i) => (
                  <SlotCard
                    key={`${slot.salonId}-${slot.startTime}-${i}`}
                    slot={slot as SearchResult}
                    onBook={() => {
                      // Phase 2.5D Task 3 — analytics on click.
                      const meta = (slot as RankedSlot).rankingMeta;
                      const fromFallback = (slot as RankedSlot).fromFallback;
                      trackSearchEvent({
                        type: "search.result_click",
                        slotId: `${slot.salonId}|${slot.startTime}|${slot.serviceId ?? ""}`,
                        salonId: slot.salonId,
                        serviceId: slot.serviceId,
                        position: i,
                        fallbackLevel: meta?.fallbackLevel ?? fallbackLevel,
                        strategy: meta?.strategy ?? "bookingwidget",
                      });
                      if (fromFallback) {
                        trackSearchEvent({
                          type: "search.fallback_accepted",
                          level: meta?.fallbackLevel ?? fallbackLevel,
                          converted: true,
                          slotId: `${slot.salonId}|${slot.startTime}|${slot.serviceId ?? ""}`,
                          salonId: slot.salonId,
                          serviceId: slot.serviceId,
                          strategy: meta?.strategy ?? "bookingwidget",
                          city: slot.city,
                          service: slot.serviceName,
                        });
                      }
                      onBook(slot);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
    </section>
  );
}

/* ── Slot card ─────────────────────────────────────────────────────────────── */

function SlotCard({
  slot,
  onBook,
}: {
  slot: SearchResult;
  onBook: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const timeLabel = slot.timeLabel ?? formatTimeFallback(slot.startTime);
  const dateLabel = slot.dateLabel ?? formatDateFallback(slot.startTime);
  const isSynthetic = slot.isSynthetic;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Synthetic indicator stripe */}
      {isSynthetic && (
        <div
          title="Okvirni termin — potvrda pri zakazivanju"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "var(--border)",
            opacity: 0.5,
          }}
        />
      )}

      {/* Date + time row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--display-font)",
            fontWeight: 400,
            fontSize: 32,
            lineHeight: 1,
            color: "var(--fg-1)",
            letterSpacing: "-0.02em",
          }}
        >
          {timeLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 11,
            color: "var(--secondary-color)",
            background: "var(--brand-50, #fdf4ff)",
            borderRadius: 8,
            padding: "3px 8px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {dateLabel}
        </span>
      </div>

      {/* Salon name + verified */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginBottom: 3,
        }}
      >
        <h3
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--fg-1)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {slot.serviceName}
          {slot.serviceDuration ? ` · ${slot.serviceDuration} min` : ""}
        </h3>
        {slot.verified && (
          <CheckBadgeIcon
            title="Verifikovani salon"
            style={{
              width: 15,
              height: 15,
              color: "var(--secondary-color)",
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* Service name */}
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 500,
          fontSize: 12,
          color: "var(--fg-3)",
          margin: "0 0 12px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {slot.salonName}
      </p>

      {/* Meta row: distance + price */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 6,
        }}
      >
        {(() => {
          // Phase 2.5C Task 7 — single distance formatter everywhere.
          const distLabel = formatDistance(slot.distanceKm);
          return distLabel ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontFamily: "var(--main-font)",
                fontWeight: 500,
                fontSize: 11,
                color: "var(--fg-3)",
              }}
            >
              <MapPinIcon style={{ width: 11, height: 11 }} />
              {distLabel}
            </span>
          ) : (
            <span />
          );
        })()}

        {slot.price ? (
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--fg-1)",
              whiteSpace: "nowrap",
            }}
          >
            {slot.hasVariants ? "od " : ""}
            {new Intl.NumberFormat("sr-Latn").format(slot.price)} RSD
          </span>
        ) : (
          slot.isSynthetic && (
            <span
              style={{
                fontFamily: "var(--main-font)",
                fontWeight: 500,
                fontSize: 11,
                color: "var(--fg-3)",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <ClockIcon style={{ width: 11, height: 11 }} />
              okvirno
            </span>
          )
        )}
      </div>

      {/* CTA */}
      <button
        onClick={onBook}
        style={{
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 13,
          padding: "10px 0",
          borderRadius: 12,
          background: hovered
            ? "var(--secondary-color)"
            : "var(--brand-100, #f3e8ff)",
          color: hovered ? "#fff" : "var(--secondary-color)",
          transition:
            "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          width: "100%",
          letterSpacing: ".01em",
        }}
      >
        Zakaži
      </button>
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */

function SlotSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={skel(72, 30)} />
        <div style={skel(56, 20, 8)} />
      </div>
      <div style={skel("65%", 13)} />
      <div style={skel("45%", 11, 0, 0.6)} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={skel(44, 11, 0, 0.4)} />
        <div style={skel(52, 13, 0, 0.4)} />
      </div>
      <div style={skel("100%", 36, 12, 0.3)} />
    </div>
  );
}

/* ── Utilities ─────────────────────────────────────────────────────────────── */

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 14,
};

function skel(
  w: number | string,
  h: number,
  borderRadius = 6,
  opacity = 0.5,
): React.CSSProperties {
  return {
    width: typeof w === "number" ? w : w,
    height: h,
    borderRadius,
    background: "var(--border)",
    opacity,
    flexShrink: 0,
  };
}

function formatTimeFallback(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("sr-Latn", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Belgrade",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
];
const DAYS = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

function formatDateFallback(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const ds = iso.slice(0, 10);
  if (ds === today.toISOString().slice(0, 10)) return "Danas";
  if (ds === tomorrow.toISOString().slice(0, 10)) return "Sutra";
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
