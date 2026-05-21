"use client";

import { useMemo, useState } from "react";
import {
  ArrowsRightLeftIcon,
  ClockIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import type { CitySlots } from "@/hooks/useSearch";
import {
  CANONICAL_TO_SLUG,
  SLUG_TO_CANONICAL,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { useSalons } from "@/hooks/useSalons";
import { useCityContext } from "@/context/landing/CityContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import type { SearchResult } from "@/types/slots";
import { rankSearchResults } from "@/lib/search/rankSearchResults";
import {
  resolveFallbackPolicy,
  applyFallbackPolicy,
  type SearchIntent,
  type AvailabilityConfidence,
} from "@/lib/availability/fallbackPolicy";
import type { AvailabilityType } from "@/lib/availability/availabilityConfidence";
import { formatDistance } from "@/lib/utils/distance";
import {
  calculateDistanceKm,
  calculateTravelMinutesEstimate,
} from "@/lib/geo/distance";
import {
  createGoogleMapsLink,
  createGoogleMapsLinkFromAddress,
} from "@/lib/geo/maps";
import {
  resolveDistanceOrigin,
  resolveUserLocationOrigin,
} from "@/lib/geo/resolveDistanceOrigin";
import {
  resolveDistanceLocationLabel,
  resolveSearchLocationLabel,
} from "@/lib/geo/geoSourceDisplay";
import { resolveSearchFallback } from "@/lib/search/searchFallback";
import { trackSearchEvent } from "@/lib/search/searchAnalytics";
import { SERBIAN_CITIES } from "@/lib/cities";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import { useLandingUI } from "@/context/landing/LandingUIContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const BUFFER_MIN = 30;
const MONTHS_SR = [
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
const DAYS_SR = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuickSlot {
  salonId: string;
  salonName: string;
  city: string;
  startTime: string;
  dateLabel: string;
  serviceId: string | null;
  serviceName: string;
  serviceCategory: string;
  serviceDuration?: number;
  servicePrice?: number;
  hasVariants?: boolean;
  isSynthetic?: boolean;
  /** Phase 2.5D Task 7 — display distance. Raw km; rendered via formatDistance. */
  distanceKm?: number;
  distanceScore?: number;
  travelMinutesEstimate?: number;
  mapsLink?: string;
  salonAddress?: string;
  salonLat?: number;
  salonLng?: number;
  /** Phase 2.5D Task 8 — slot came from fallback search (level > 1). */
  fromFallback?: boolean;
  availabilityConfidence?: AvailabilityConfidence;
  availabilityConfidenceScore?: number;
  availabilityType?: AvailabilityType;
}

interface CategoryGroup {
  slug: string;
  label: string;
  services: Array<{
    id: string;
    name: string;
    duration: number;
    price: number;
    hasVariants: boolean;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function belgradeNowMinutes(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Belgrade",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace("24:", "00:");
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function belgradeTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
  }).format(new Date());
}

function belgradeTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
  }).format(d);
}

function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

function formatDateLabel(iso: string): string {
  const dateStr = iso.slice(0, 10);
  if (dateStr === belgradeTodayStr()) return "Danas";
  if (dateStr === belgradeTomorrowStr()) return "Sutra";
  const [y, mo, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, mo - 1, dd);
  return `${DAYS_SR[d.getDay()]}, ${dd}. ${MONTHS_SR[d.getMonth()]}`;
}

function slotTooSoon(iso: string): boolean {
  if (iso.slice(0, 10) !== belgradeTodayStr()) return false;
  const [hh, mm] = iso.slice(11, 16).split(":").map(Number);
  return hh * 60 + mm < belgradeNowMinutes() + BUFFER_MIN;
}

function cityMatches(a: string | undefined, b: string | undefined): boolean {
  if (!b) return true;
  if (!a) return false;
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

function resolveCategoryLabel(raw: string): string {
  if (!raw || raw === "other" || raw === "Ostalo") return "";
  const fromSlug = SLUG_TO_CANONICAL[raw as CategorySlug];
  if (fromSlug) return fromSlug;
  if (CANONICAL_TO_SLUG[raw]) return raw;
  return "";
}

function resolveCategorySlug(raw: string): string {
  if (!raw) return "";
  if (raw in SLUG_TO_CANONICAL) return raw;
  const fromCanonical = CANONICAL_TO_SLUG[raw];
  if (fromCanonical) return fromCanonical;
  return "";
}

function formatPrice(
  price: number | undefined,
  hasVariants: boolean | undefined,
): string | null {
  if (!price || price <= 0) return null;
  const formatted = price.toLocaleString("sr-RS");
  return hasVariants ? `od ${formatted} RSD` : `${formatted} RSD`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QuickAccess() {
  const { city, cityName, setCity, geoSignals, geoResolved } = useCityContext();
  const {
    category,
    subcategoryFilter: subcategory,
    dateFilter: date,
    timeWindowStart,
    timeWindowEnd,
    handleCategoryPick,
  } = useFilters();
  const {
    results,
    slotsByCity,
    fallbackLevel,
    recoveryState,
    isLoading: searchLoading,
  } = useSearchContext();
  const distanceOrigin = resolveDistanceOrigin(geoSignals, city);
  const userLocationOrigin = resolveUserLocationOrigin(geoSignals);
  const searchLocationLabel = useMemo(
    () => resolveSearchLocationLabel(geoResolved),
    [geoResolved],
  );
  const distanceLocationLabel = useMemo(
    () => resolveDistanceLocationLabel(distanceOrigin),
    [distanceOrigin],
  );
  const { data: salons = [], isLoading: salonsLoading } = useSalons(cityName);

  const onPick = (slot: QuickSlot, position: number) => {
    const flatSlot = {
      salonId: slot.salonId,
      salonName: slot.salonName,
      serviceId: slot.serviceId,
      serviceName: slot.serviceName,
      category: slot.serviceCategory,
      startTime: slot.startTime,
      city: slot.city,
      price: slot.servicePrice,
      serviceDuration: slot.serviceDuration,
      distanceKm: slot.distanceKm,
      travelMinutesEstimate: slot.travelMinutesEstimate,
      mapsLink: slot.mapsLink,
      salonAddress: slot.salonAddress,
      salonLat: slot.salonLat,
      salonLng: slot.salonLng,
    };
    // Phase 2.5D Task 3 — analytics on click + fallback conversion.
    const slotId = `${slot.salonId}|${slot.startTime}|${slot.serviceId ?? ""}`;
    trackSearchEvent({
      type: "search.result_click",
      slotId,
      salonId: slot.salonId,
      serviceId: slot.serviceId,
      position,
      fallbackLevel,
      strategy: "quickaccess",
    });
    if (slot.fromFallback) {
      trackSearchEvent({
        type: "search.fallback_accepted",
        level: fallbackLevel,
        converted: true,
        slotId,
        salonId: slot.salonId,
        serviceId: slot.serviceId,
        strategy: "quickaccess",
        city: slot.city,
        service: slot.serviceName,
      });
    }
    sendSystemAction({
      action: "SLOT_SELECTED",
      source: "QuickAccess",
      payload: { selectedSlot: flatSlot },
      notifyAgent: false,
      visibleInThread: false,
    });
  };

  // Phase 2.5D Task 2 — fallback metadata used to drive empty-state copy.
  const fallbackInfo = useMemo(
    () => resolveSearchFallback(fallbackLevel),
    [fallbackLevel],
  );

  const onCategoryPick = (slug: string) =>
    handleCategoryPick(slug, cityName ?? "");
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);

  // Salons for the user's city only (if city is known)
  const citySalons = useMemo(
    () =>
      cityName ? salons.filter((s) => cityMatches(s.city, cityName)) : salons,
    [salons, cityName],
  );

  // Phase 2.5D Task 1 — single dataset source.
  // QuickAccess now consumes the SAME ranked results as BookingWidget.
  // Local synthetic slot generation is removed: the search API (findBestSlots)
  // already provides L6 synthetic slots when needed, so the data path is
  // unified. citySalons is still used for the category-listing UI below —
  // not for slot generation.
  //
  // Phase 3 — Policy enforcement. Apply consumer trust policy BEFORE converting
  // to QuickSlot so that synthetic, nearby-city, and category-drift slots are
  // structurally removed here, not in downstream UI conditionals.
  const allSlots = useMemo<QuickSlot[]>(() => {
    // Derive intent from active filters — determines maxFallbackLevel.
    const intent: SearchIntent = category
      ? cityName
        ? { kind: "explicit_city_service" }
        : { kind: "explicit_service" }
      : { kind: "implicit_geo" };

    const policy = resolveFallbackPolicy("quickaccess", intent);
    const shouldTrustEffectiveCity =
      recoveryState?.recoveryScenario === "exact_in_nearest_city" ||
      recoveryState?.recoveryScenario === "related_in_nearest_city";
    const policyFiltered = shouldTrustEffectiveCity
      ? results.filter((slot) => slot.isSynthetic !== true)
      : applyFallbackPolicy(results, policy);

    return policyFiltered
      .filter((r) => !slotTooSoon(r.startTime))
      .map<QuickSlot>((r) => ({
        salonId: r.salonId,
        salonName: r.salonName,
        city: r.city,
        startTime: r.startTime,
        dateLabel: r.dateLabel || formatDateLabel(r.startTime),
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        serviceCategory: resolveCategoryLabel(r.category ?? ""),
        serviceDuration: r.serviceDuration,
        servicePrice: r.price,
        hasVariants: r.hasVariants ?? false,
        isSynthetic: r.isSynthetic ?? false,
        availabilityConfidence: r.availabilityConfidence,
        availabilityConfidenceScore: r.availabilityConfidenceScore,
        availabilityType: r.availabilityType,
        distanceKm: r.distanceKm,
        distanceScore: r.distanceScore,
        travelMinutesEstimate: r.travelMinutesEstimate,
        mapsLink: r.mapsLink,
        salonAddress: r.salonAddress,
        salonLat: r.salonLat,
        salonLng: r.salonLng,
        fromFallback: (r.fallbackLevel ?? 0) > 1,
      }));
  }, [results, category, cityName, recoveryState?.recoveryScenario]);

  // Filter slots to the searched category (when active)
  const categoryFilteredSlots = useMemo<QuickSlot[]>(() => {
    if (!category) return allSlots;
    const canonicalLabel = SLUG_TO_CANONICAL[category as CategorySlug];
    if (!canonicalLabel) return allSlots;
    return allSlots.filter((s) => s.serviceCategory === canonicalLabel);
  }, [allSlots, category]);

  // Filter by date and time window when a search is active
  const dateTimeFilteredSlots = useMemo<QuickSlot[]>(() => {
    let slots = categoryFilteredSlots;
    if (date) {
      const byDate = slots.filter((s) => s.startTime.slice(0, 10) === date);
      if (byDate.length > 0) slots = byDate;
    }
    if (timeWindowStart !== undefined) {
      const byTime = slots.filter((s) => {
        const h = parseInt(s.startTime.slice(11, 13), 10);
        return (
          h >= timeWindowStart && (timeWindowEnd == null || h <= timeWindowEnd)
        );
      });
      if (byTime.length > 0) slots = byTime;
    }
    return slots;
  }, [categoryFilteredSlots, date, timeWindowStart, timeWindowEnd]);

  // Narrow to subcategory match when set (service name contains the search term)
  const subcategoryFilteredSlots = useMemo<QuickSlot[]>(() => {
    if (!subcategory) return dateTimeFilteredSlots;
    const subNorm = stripDiacritics(subcategory.toLowerCase());
    const byName = dateTimeFilteredSlots.filter((s) =>
      stripDiacritics(s.serviceName.toLowerCase()).includes(subNorm),
    );
    return byName.length > 0 ? byName : dateTimeFilteredSlots;
  }, [dateTimeFilteredSlots, subcategory]);

  // Phase 2.5C Task 1 — unified ranking via rankSearchResults.
  // Replaces local `sort(startTime)` + `.slice(0, 3)` with the same
  // strategy-aware adapter BookingWidget uses. QuickSlot is shaped into
  // SearchResult for transport; original QuickSlot kept by identity for
  // SlotCard rendering (preserves servicePrice / serviceCategory / etc.).
  const displayedSlots = useMemo<QuickSlot[]>(() => {
    // 1. Service-filter narrowing (preserved behavior).
    const filtered = activeServiceId
      ? subcategoryFilteredSlots.filter((s) => s.serviceId === activeServiceId)
      : subcategoryFilteredSlots;
    const pool = filtered.length > 0 ? filtered : subcategoryFilteredSlots;

    // 2. Adapt QuickSlot → SearchResult for ranking transport.
    const identityKey = (qs: QuickSlot) =>
      `${qs.salonId}|${qs.startTime}|${qs.serviceId ?? ""}`;
    const bySource = new Map<string, QuickSlot>();
    const slots: SearchResult[] = pool.map((qs) => {
      const key = identityKey(qs);
      bySource.set(key, qs);
      return {
        salonId: qs.salonId,
        salonName: qs.salonName,
        serviceId: qs.serviceId,
        serviceName: qs.serviceName,
        category: qs.serviceCategory,
        startTime: qs.startTime,
        city: qs.city,
        // Phase 2.5D — preserve distance through the ranking step so
        // SlotCard can render the badge and scoring sees it.
        distanceKm: qs.distanceKm,
        distanceScore: qs.distanceScore,
        travelMinutesEstimate: qs.travelMinutesEstimate,
        mapsLink: qs.mapsLink,
        salonAddress: qs.salonAddress,
        salonLat: qs.salonLat,
        salonLng: qs.salonLng,
        price: qs.servicePrice,
        hasVariants: qs.hasVariants ?? false,
        serviceDuration: qs.serviceDuration ?? 60,
        dateLabel: qs.dateLabel,
        timeLabel: qs.startTime.slice(11, 16),
        relevanceScore: 0,
        fallbackLevel,
        isSynthetic: qs.isSynthetic,
        availabilityConfidence: qs.availabilityConfidence,
        availabilityConfidenceScore: qs.availabilityConfidenceScore,
        availabilityType: qs.availabilityType,
      };
    });

    // 3. Unified ranking. QuickAccess strategy applies max 3 results +
    // service/salon/category diversity caps.
    const ranked = rankSearchResults({
      slots,
      strategy: "quickaccess",
      userLocation: distanceOrigin
        ? { lat: distanceOrigin.lat, lng: distanceOrigin.lng }
        : undefined,
      fallbackLevel,
    });

    // 4. Map back to QuickSlot for SlotCard rendering. Skip the rare case
    // where a ranked entry can't be matched (shouldn't happen — fail open).
    const out: QuickSlot[] = [];
    for (const r of ranked.slots) {
      const key = `${r.salonId}|${r.startTime}|${r.serviceId ?? ""}`;
      const original = bySource.get(key);
      if (original) out.push(original);
    }
    return out;
  }, [
    subcategoryFilteredSlots,
    activeServiceId,
    distanceOrigin?.lat,
    distanceOrigin?.lng,
    fallbackLevel,
  ]);

  // Category groups with services (from city salons only)
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    for (const salon of citySalons) {
      for (const svc of salon.services) {
        if (!svc.category) continue;
        const slug = resolveCategorySlug(svc.category);
        if (!slug || slug === "other") continue;
        const label = SLUG_TO_CANONICAL[slug as CategorySlug] ?? slug;
        if (!map.has(slug)) map.set(slug, { slug, label, services: [] });
        const grp = map.get(slug)!;
        if (!grp.services.some((s) => s.name === svc.name)) {
          grp.services.push({
            id: svc.id,
            name: svc.name,
            duration: svc.duration,
            price: svc.price,
            hasVariants: svc.hasVariants,
          });
        }
      }
    }
    return [...map.values()].sort(
      (a, b) => b.services.length - a.services.length,
    );
  }, [citySalons]);

  const displayCity =
    recoveryState?.effectiveCity || cityName || displayedSlots[0]?.city || "";
  const canonicalCategory = category
    ? SLUG_TO_CANONICAL[category as CategorySlug]
    : "";
  const isQuickAccessSettled = !searchLoading && !salonsLoading;
  const hasSlots = displayedSlots.length > 0;
  const hasData =
    isQuickAccessSettled &&
    (citySalons.length > 0 || (slotsByCity?.length ?? 0) > 0);

  return (
    <section id="quick-access" style={{ marginTop: 64 }}>
      {/* Section header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
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
          Brzi pristup
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
          Šta ti treba danas?
        </h2>
      </div>

      {/* ── Slots ──────────────────────────────────────────────────────────── */}
      {!isQuickAccessSettled ? (
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              height: 16,
              width: 180,
              borderRadius: 6,
              background: "var(--border)",
              opacity: 0.4,
              marginBottom: 16,
            }}
          />
          <div className="ms-slots-row">
            {[0, 1, 2].map((i) => (
              <SlotSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : hasSlots ? (
        <div style={{ marginBottom: 40 }}>
          {recoveryState?.userMessage && (
            <p
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 13,
                color: "var(--fg-2)",
                margin: "0 0 12px",
                textAlign: "left",
              }}
            >
              {recoveryState.userMessage}
            </p>
          )}
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--fg-3)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ClockIcon style={{ width: 15, height: 15 }} strokeWidth={2} />
            <span>
              {canonicalCategory
                ? `${canonicalCategory} — ${displayCity}`
                : `Termini u — ${displayCity}`}
              <span style={{ opacity: 0.78 }}>
                {" | "}
                {searchLocationLabel}
                {" | "}
                {distanceLocationLabel}
              </span>
            </span>
          </p>
          <div className="ms-slots-row">
            {displayedSlots.map((slot, i) => (
              <SlotCard
                key={`${slot.salonId}-${slot.startTime}-${slot.serviceId ?? ""}`}
                slot={slot}
                userLocation={userLocationOrigin}
                onBook={() => onPick(slot, i)}
              />
            ))}
          </div>
          {recoveryState?.nearbyCitySuggestions &&
            recoveryState.nearbyCitySuggestions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {recoveryState.nearbyCitySuggestions.map((suggestion) => (
                  <button
                    key={suggestion.city}
                    type="button"
                    onClick={() => {
                      const city = SERBIAN_CITIES.find(
                        (item) => item.name === suggestion.city,
                      );
                      if (city) setCity(city);
                    }}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      background: "var(--surface)",
                      borderRadius: 999,
                      padding: "5px 10px",
                      fontFamily: "var(--main-font)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--fg-2)",
                      cursor: "pointer",
                    }}
                  >
                    {suggestion.city} {suggestion.count}{" "}
                    {suggestion.count === 1 ? "termin" : "termina"}
                  </button>
                ))}
              </div>
            )}
          {/* Phase 2.5D Task 2 — show fallback hint when results came from a
              relaxed search. resolveSearchFallback produces the wording. */}
          {fallbackInfo.isExpanded && !recoveryState?.userMessage && (
            <p
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 12,
                color: "var(--fg-3)",
                marginTop: 12,
                fontStyle: "italic",
              }}
            >
              {fallbackInfo.userMessage}
            </p>
          )}
        </div>
      ) : category && canonicalCategory ? (
        <CategoryNotFound
          category={canonicalCategory}
          categorySlug={category}
          city={displayCity}
          alternateCities={(slotsByCity ?? []).filter(
            (g) =>
              g.city.toLowerCase() !== displayCity.toLowerCase() &&
              g.slots.length > 0,
          )}
        />
      ) : (
        <RecoveryCTA
          city={displayCity}
          locationContext={`${searchLocationLabel} | ${distanceLocationLabel}`}
          noSalons={recoveryState?.reason === "no_city_salons"}
        />
      )}

      {/* ── Categories — hidden when a search category is active ──────────── */}
      {!category && (hasData || !isQuickAccessSettled) && (
        <div style={{ marginTop: 8, marginBottom: 48 }}>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--fg-3)",
              marginBottom: 14,
            }}
          >
            Dostupne kategorije danas
          </p>

          <div className="ms-cat-rows">
            {!isQuickAccessSettled &&
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 38,
                    borderRadius: 20,
                    background: "var(--surface-2, var(--surface))",
                    opacity: 0.6,
                  }}
                />
              ))}

            {isQuickAccessSettled &&
              categoryGroups.map((grp) => (
                <CategoryCard
                  key={grp.slug}
                  group={grp}
                  active={category === grp.slug}
                  activeServiceId={activeServiceId}
                  onCategoryClick={() => {
                    setActiveServiceId(null);
                    onCategoryPick(category === grp.slug ? "" : grp.slug);
                  }}
                  onServiceClick={(id) =>
                    setActiveServiceId((prev) => (prev === id ? null : id))
                  }
                />
              ))}
          </div>
        </div>
      )}

      <style>{`
        .ms-slots-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        .ms-cat-rows {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        @media (max-width: 700px) {
          .ms-slots-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}

// ── Slot card ─────────────────────────────────────────────────────────────────

function SlotCard({
  slot,
  onBook,
  userLocation,
}: {
  slot: QuickSlot;
  onBook: () => void;
  userLocation?: { lat: number; lng: number };
}) {
  const [hovered, setHovered] = useState(false);
  const timeStr = formatTime(slot.startTime);
  const priceStr = formatPrice(slot.servicePrice, slot.hasVariants);

  const serviceParts = [
    slot.serviceName || null,
    slot.serviceCategory || null,
    slot.serviceDuration ? `${slot.serviceDuration} min` : null,
  ].filter(Boolean);
  const serviceDetails = serviceParts.join(" · ");
  const gpsDistanceKm =
    userLocation && slot.salonLat != null && slot.salonLng != null
      ? calculateDistanceKm(
          userLocation.lat,
          userLocation.lng,
          slot.salonLat,
          slot.salonLng,
        )
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
        padding: "20px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {slot.isSynthetic && (
        <div
          title="Okvirni termin"
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

      {/* Date label */}
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--fg-3)",
          margin: "0 0 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{slot.dateLabel}</span>
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
                fontWeight: 500,
                color: "var(--fg-3)",
                fontSize: 10,
                opacity: 0.85,
                whiteSpace: "nowrap",
              }}
            >
              <ArrowsRightLeftIcon
                style={{ width: 11, height: 11 }}
                strokeWidth={1.8}
              />
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
                color: "var(--secondary-color)",
                fontSize: 10,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <MapPinIcon style={{ width: 11, height: 11 }} strokeWidth={1.8} />
              Mapa
            </a>
          )}
        </span>
      </p>

      {/* Time + city badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          {timeStr}
        </span>
        {slot.city && (
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--brand-100, #f3e8ff)",
              color: "var(--secondary-color)",
              padding: "3px 9px",
              borderRadius: 20,
              flexShrink: 0,
            }}
          >
            {slot.city}
          </span>
        )}
      </div>

      {/* Service · category · duration */}
      {serviceDetails && (
        <h3
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--fg-1)",
            margin: "0 0 4px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {serviceDetails}
        </h3>
      )}
      {/* Salon name */}
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 500,
          fontSize: 12,
          color: "var(--fg-3)",
          margin: "0 0 4px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {slot.salonName}
      </p>

      {/* Price */}
      {priceStr ? (
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 12,
            color: "var(--secondary-color)",
            margin: "0 0 14px",
          }}
        >
          {priceStr}
        </p>
      ) : (
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 12,
            color: "var(--secondary-color)",
            margin: "0 0 14px",
            visibility: "hidden",
          }}
        >
          nema cena
        </p>
      )}

      {/* Book button */}
      <button
        onClick={onBook}
        style={{
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 13,
          padding: "9px 0",
          borderRadius: 12,
          background: hovered
            ? "var(--secondary-color)"
            : "var(--brand-100, #f3e8ff)",
          color: hovered ? "#fff" : "var(--secondary-color)",
          transition:
            "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          width: "100%",
          marginTop: 8,
        }}
      >
        Rezerviši
      </button>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  group,
  active,
  activeServiceId,
  onCategoryClick,
  onServiceClick,
}: {
  group: CategoryGroup;
  active: boolean;
  activeServiceId: string | null;
  onCategoryClick: () => void;
  onServiceClick: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        width: "100%",
      }}
    >
      {/* Category badge */}
      <button
        onClick={onCategoryClick}
        style={{
          flexShrink: 0,
          border: active
            ? "2px solid var(--secondary-color)"
            : "2px solid var(--border)",
          borderRadius: 20,
          padding: "6px 14px",
          cursor: "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 13,
          background: active ? "var(--secondary-color)" : "var(--surface)",
          color: active ? "#fff" : "var(--fg-1)",
          transition: "all var(--dur-fast) var(--ease-out)",
          whiteSpace: "nowrap",
        }}
      >
        {group.label}
      </button>

      {/* Service badges */}
      {group.services.map((svc) => {
        const isActive = activeServiceId === svc.id;
        const priceStr = formatPrice(svc.price, svc.hasVariants);
        const label = priceStr ? `${svc.name} · ${priceStr}` : svc.name;
        return (
          <button
            key={svc.id}
            onClick={(e) => {
              e.stopPropagation();
              onServiceClick(svc.id);
            }}
            style={{
              flexShrink: 0,
              border: isActive
                ? "2px solid var(--secondary-color)"
                : "2px solid var(--border)",
              borderRadius: 20,
              padding: "6px 14px",
              cursor: "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 500,
              fontSize: 12,
              background: isActive
                ? "var(--brand-100, #f3e8ff)"
                : "var(--surface)",
              color: isActive
                ? "var(--secondary-color)"
                : "var(--fg-2, var(--fg-1))",
              transition: "all var(--dur-fast) var(--ease-out)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Category not found ────────────────────────────────────────────────────────

function CategoryNotFound({
  category,
  categorySlug,
  city,
  alternateCities,
}: {
  category: string;
  categorySlug: string;
  city: string;
  alternateCities: CitySlots[];
}) {
  const hasCities = alternateCities.length > 0;

  return (
    <div
      style={{ marginBottom: 32, textAlign: "center", padding: "28px 24px" }}
    >
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 16,
          color: "var(--fg-1)",
          margin: "0 0 8px",
        }}
      >
        Nema slobodnih termina za {category}
        {city ? ` u ${city}` : ""}
      </p>

      {hasCities ? (
        <>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: "0 0 16px",
            }}
          >
            Ima slobodnih termina u:
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "center",
            }}
          >
            {alternateCities.slice(0, 4).map((g) => {
              const citySlug = g.city.toLowerCase().replace(/\s+/g, "-");
              return (
                <a
                  key={g.city}
                  href={`/${citySlug}/${categorySlug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--main-font)",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#fff",
                    background: "var(--secondary-color)",
                    padding: "10px 20px",
                    borderRadius: 999,
                    textDecoration: "none",
                    transition: "background var(--dur-fast) var(--ease-out)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--secondary-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--secondary-color)";
                  }}
                >
                  {g.city}
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    {g.slots.length}{" "}
                    {g.slots.length === 1 ? "termin" : "termina"}
                  </span>
                </a>
              );
            })}
          </div>
        </>
      ) : (
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontSize: 13,
            color: "var(--fg-3)",
            margin: 0,
          }}
        >
          Pogledaj termine u okolnim gradovima ispod &darr;
        </p>
      )}
    </div>
  );
}

// ── Recovery CTA ──────────────────────────────────────────────────────────────

function RecoveryCTA({
  city,
  locationContext,
  noSalons,
}: {
  city: string;
  locationContext: string;
  noSalons?: boolean;
}) {
  const { setDrawerOpen } = useLandingUI();
  const cityIn =
    city === "Sremska Mitrovica"
      ? "Sremskoj Mitrovici"
      : city === "Novi Sad"
        ? "Novom Sadu"
        : city === "Beograd"
          ? "Beogradu"
          : city;
  return (
    <div style={{ marginBottom: 40 }}>
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 600,
          fontSize: 13,
          color: "var(--fg-3)",
          margin: "0 0 12px",
          textAlign: "center",
        }}
      >
        prikazujemo na osnovu: {locationContext}
      </p>
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 600,
          fontSize: 16,
          color: "var(--fg-1)",
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        {noSalons
          ? `Nema salona${city ? ` u ${cityIn}` : ""}.`
          : `Nema slobodnih termina trenutno${city ? ` - ${city}` : ""}.`}
      </p>
      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 mt-6">
        {/* CTA 1 — Primary: Marija finds a slot */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 20,
            padding: "20px 24px",
            boxShadow: "var(--shadow-sm)",
          }}
          className="flex-1"
        >
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--fg-1)",
              margin: "0 0 6px",
            }}
          >
            Marija će vam dati više informacija o terminima i salonima.
          </p>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: "0 0 16px",
            }}
          >
            Marija ima informacije o svim slobodnim terminima i salonima.
          </p>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 20px",
              borderRadius: 12,
              background: "var(--secondary-color)",
              color: "#fff",
              width: "100%",
            }}
          >
            Pitaj Mariju
          </button>
        </div>

        {/* CTA 2 — Secondary: notify me */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 20,
            padding: "20px 24px",
            boxShadow: "var(--shadow-sm)",
          }}
          className="flex-1"
        >
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--fg-1)",
              margin: "0 0 6px",
            }}
          >
            Obavesti me
          </p>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: "0 0 16px",
            }}
          >
            Dobijte obaveštenje čim se pojavi slobodan termin.
          </p>
          <button
            type="button"
            onClick={() => {
              const notifySection = document.getElementById("notify-me");
              notifySection?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            style={{
              cursor: "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 20px",
              borderRadius: 12,
              background: "transparent",
              border: "2px solid var(--secondary-color)",
              color: "var(--secondary-color)",
              width: "100%",
            }}
          >
            Obavesti me
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SlotSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        padding: "20px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          width: 60,
          height: 11,
          borderRadius: 4,
          background: "var(--border)",
          opacity: 0.4,
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 32,
            borderRadius: 8,
            background: "var(--border)",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 50,
            height: 20,
            borderRadius: 10,
            background: "var(--border)",
            opacity: 0.4,
          }}
        />
      </div>
      <div>
        <div
          style={{
            width: "70%",
            height: 14,
            borderRadius: 6,
            background: "var(--border)",
            opacity: 0.5,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            width: "50%",
            height: 12,
            borderRadius: 6,
            background: "var(--border)",
            opacity: 0.3,
          }}
        />
      </div>
      <div
        style={{
          width: "100%",
          height: 36,
          borderRadius: 12,
          background: "var(--border)",
          opacity: 0.3,
        }}
      />
    </div>
  );
}
