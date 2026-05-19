"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowsRightLeftIcon,
  CheckBadgeIcon,
  MapPinIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";
import type { SearchResult } from "@/types/slots";
import { useCityContext } from "@/context/landing/CityContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { formatDistance } from "@/lib/utils/distance";
import { calculateDistanceKm, calculateTravelMinutesEstimate } from "@/lib/geo/distance";
import {
  createGoogleMapsLink,
  createGoogleMapsLinkFromAddress,
} from "@/lib/geo/maps";
import {
  resolveDistanceOrigin,
  resolveUserLocationOrigin,
} from "@/lib/geo/resolveDistanceOrigin";
import type { RankedSlot } from "@/lib/search/rankSearchResults";
import { bookingWidgetRecoveryCopy } from "@/lib/search/bookingWidgetRecoveryCopy";
import {
  buildBookingDiscoveryGroups,
  type BookingDiscoveryGroup,
  type BookingDiscoveryMode,
} from "@/lib/search/buildBookingDiscoveryGroups";
import { SLUG_TO_CANONICAL, type CategorySlug } from "@/lib/intent/categoryMap";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";

/** Returns a human-readable section label for a city group. */
function cityGroupLabel(
  group: BookingDiscoveryGroup,
  userCity: string | undefined,
): string {
  if (group.title) return group.title;

  const isUserCity = userCity && group.city?.toLowerCase() === userCity.toLowerCase();
  if (isUserCity) return `Slobodni termini — ${group.city}`;
  return group.city ? `Termini u blizini — ${group.city}` : "Slobodni termini";
}

export default function BookingWidget() {
  const { city, cityName: userCity, geoSignals } = useCityContext();
  const {
    rankedDiscovery,
    quickAccessPreviewIds,
    discoveryFallback,
    fallbackLevel,
    recoveryState,
    isLoading: loading,
  } = useSearchContext();
  const {
    category,
    subcategoryFilter,
    searchQuery,
    dateFilter,
    timeWindowStart,
    timeWindowEnd,
  } = useFilters();
  const { openModal: onBook } = useBookingModal();
  const distanceOrigin = resolveDistanceOrigin(geoSignals, city);
  const userLocationOrigin = resolveUserLocationOrigin(geoSignals);

  const discoveryBuild = useMemo(() => {
    const hasSearchIntent = Boolean(
      searchQuery || category || subcategoryFilter || dateFilter || timeWindowStart != null || timeWindowEnd != null,
    );
    const hasGeo = distanceOrigin != null;
    const mode: BookingDiscoveryMode =
      fallbackLevel >= 3
        ? "recovery"
        : hasSearchIntent
          ? "search"
          : hasGeo
            ? "geo_load"
            : "initial_load";

    return buildBookingDiscoveryGroups({
      slots: rankedDiscovery,
      quickAccessSlotIds: quickAccessPreviewIds,
      query: {
        city: userCity,
        category: category || undefined,
        service: searchQuery || subcategoryFilter,
        date: dateFilter,
        timeWindowStart,
        timeWindowEnd,
      },
      userCity,
      savedCity: geoSignals.saved?.city,
      userLocation: distanceOrigin
        ? { lat: distanceOrigin.lat, lng: distanceOrigin.lng }
        : undefined,
      fallbackLevel,
      mode,
      recoveryState,
    });
    },
    [
      rankedDiscovery,
      quickAccessPreviewIds,
      discoveryFallback.label,
      distanceOrigin?.lat,
      distanceOrigin?.lng,
      userCity,
      geoSignals.saved?.city,
      searchQuery,
      category,
      subcategoryFilter,
      dateFilter,
      timeWindowStart,
      timeWindowEnd,
      fallbackLevel,
      recoveryState,
    ],
  );
  const discoveryGroups = discoveryBuild.groups;
  const bookingWidgetDebug = discoveryBuild.debug;
  const hasAny = discoveryGroups.some((g) => g.slots.length > 0);
  const hasSearchIntent = Boolean(
    searchQuery || category || subcategoryFilter || dateFilter || timeWindowStart != null || timeWindowEnd != null,
  );
  const categoryLabel = category
    ? SLUG_TO_CANONICAL[category as CategorySlug] ?? category
    : undefined;
  const recognizedServiceLabel = categoryLabel
    ? subcategoryFilter || categoryLabel
    : undefined;
  const recoveryCopy = bookingWidgetRecoveryCopy({
    city: userCity,
    recoveryState,
    hasSearchIntent,
    categoryLabel,
    serviceLabel: recognizedServiceLabel,
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[BOOKING_WIDGET_DEBUG]", bookingWidgetDebug);
    }
  }, [bookingWidgetDebug]);

  // Compute a friendly subtitle once
  const subtitle = useMemo(() => {
    if (loading) return null;
    // Cascade banner: selected city has no salons/slots but we found options
    // in nearby/popular cities — make that explicit to the user.
    const cityCascadeActive =
      hasAny &&
      (recoveryState?.reason === "no_city_salons" ||
        recoveryState?.reason === "no_city_slots");
    if (cityCascadeActive) {
      return userCity
        ? `Nema slobodnih termina za grad ${userCity}. Prikazujemo najbliže gradove sa terminima.`
        : "Prikazujemo najbliže gradove sa slobodnim terminima.";
    }
    if (recoveryCopy?.title) return recoveryCopy.title;
    if (!hasAny) return null;
    const cities = discoveryGroups
      .filter((g) => g.slots.length > 0)
      .map((g) => g.city)
      .filter((c): c is string => Boolean(c));
    if (cities.length === 0) return null;
    const hasUserCity =
      userCity && cities[0]?.toLowerCase() === userCity.toLowerCase();
    if (hasUserCity) return null; // no extra explanation needed
    // Defer to ranked.fallback.userMessage when expanded, but keep the
    // BookingWidget-specific wording for L4/L5.
    if (fallbackLevel >= 5) return "Prikazujemo termine iz popularnih gradova.";
    if (fallbackLevel >= 4) return "Prikazujemo termine iz gradova u blizini.";
    return null;
  }, [hasAny, loading, discoveryGroups, userCity, fallbackLevel, recoveryCopy?.title, recoveryState?.reason]);

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
            {recoveryCopy?.title ?? "Trenutno nema dostupnih termina."}
          </p>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: 0,
            }}
          >
            {recoveryCopy?.body ||
              "Prikazaćemo najbliže dostupne opcije čim ih pronađemo."}
          </p>
        </div>
      )}

      {!loading &&
        discoveryGroups
          .filter((g) => g.slots.length > 0)
          .map((group) => (
            <div key={group.id} style={{ marginBottom: 44 }}>
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
                {cityGroupLabel(group, userCity)}
              </h3>
              {group.subtitle && (
                <p
                  style={{
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    color: "var(--fg-3)",
                    margin: "-10px 0 16px 14px",
                  }}
                >
                  {group.subtitle}
                </p>
              )}

              <div style={gridStyle}>
                {group.slots.map((slot, i) => (
                  <SlotCard
                    key={`${slot.salonId}-${slot.startTime}-${i}`}
                    slot={slot as SearchResult}
                    userLocation={userLocationOrigin}
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
  userLocation,
}: {
  slot: SearchResult;
  onBook: () => void;
  userLocation?: { lat: number; lng: number };
}) {
  const [hovered, setHovered] = useState(false);

  const timeLabel = slot.timeLabel ?? formatTimeFallback(slot.startTime);
  const dateLabel = slot.dateLabel ?? formatDateFallback(slot.startTime);
  const isSynthetic = slot.isSynthetic;
  const gpsDistanceKm =
    userLocation && slot.salonLat != null && slot.salonLng != null
      ? calculateDistanceKm(userLocation.lat, userLocation.lng, slot.salonLat, slot.salonLng)
      : undefined;
  const displayDistanceKm =
    gpsDistanceKm != null && Number.isFinite(gpsDistanceKm)
      ? gpsDistanceKm
      : slot.distanceKm;
  const displayTravelMinutes =
    gpsDistanceKm != null && Number.isFinite(gpsDistanceKm)
      ? calculateTravelMinutesEstimate(gpsDistanceKm)
      : slot.travelMinutesEstimate;
  const salonMapLink =
    slot.salonLat != null && slot.salonLng != null
      ? createGoogleMapsLink(slot.salonLat, slot.salonLng)
      : createGoogleMapsLinkFromAddress(slot.salonAddress ?? "", slot.city);
  const mapHref = salonMapLink || slot.mapsLink;
  const distLabel = formatDistance(displayDistanceKm);
  const travelTitle = displayTravelMinutes
    ? `oko ${displayTravelMinutes} min`
    : undefined;

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

      {/* Date + location row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
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
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          {distLabel && (
            <span
              title={travelTitle ? `Udaljenost, ${travelTitle}` : "Udaljenost"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontFamily: "var(--main-font)",
                fontWeight: 500,
                fontSize: 11,
                color: "var(--fg-3)",
                whiteSpace: "nowrap",
              }}
            >
              <ArrowsRightLeftIcon style={{ width: 12, height: 12 }} />
              {distLabel}
            </span>
          )}
          {mapHref && (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              title={travelTitle ?? "Prikaži mapu"}
              onClick={(event) => event.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 11,
                color: "var(--secondary-color)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <MapPinIcon style={{ width: 12, height: 12 }} />
              Mapa
            </a>
          )}
        </span>
      </div>

      {slot.isSynthetic && (
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--fg-3)",
            margin: "-4px 0 8px",
          }}
        >
          mogući termin
        </p>
      )}

      {/* Time row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "flex-start",
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

      {/* Meta row: price */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 6,
        }}
      >
        <span />

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
