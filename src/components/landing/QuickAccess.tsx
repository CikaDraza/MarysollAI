"use client";

import { useMemo, useState } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import type { CitySlots } from "@/hooks/useSearch";
import {
  CANONICAL_TO_SLUG,
  SLUG_TO_CANONICAL,
  type CategorySlug,
} from "@/lib/intent/categoryMap";
import { generateSlotsFromWorkingHours } from "@/lib/slots/generateSlots";
import { stripDiacritics } from "@/lib/intent/parseIntent";
import { useSalons } from "@/hooks/useSalons";
import { useCityContext } from "@/context/landing/CityContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useSearchContext } from "@/context/landing/SearchContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import type { FlatSlot } from "@/types/slots";

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
  const { cityName } = useCityContext();
  const {
    category,
    subcategoryFilter: subcategory,
    dateFilter: date,
    timeWindowStart,
    timeWindowEnd,
    handleCategoryPick,
  } = useFilters();
  const { slotsByCity } = useSearchContext();
  const { openModal } = useBookingModal();
  const { data: salons = [], isLoading: loading } = useSalons(cityName);

  const onPick = (slot: QuickSlot) => {
    const flatSlot: FlatSlot = {
      salonId: slot.salonId,
      salonName: slot.salonName,
      serviceId: slot.serviceId,
      serviceName: slot.serviceName,
      category: slot.serviceCategory,
      startTime: slot.startTime,
      city: slot.city,
    };
    openModal(flatSlot);
  };

  const onCategoryPick = (slug: string) => handleCategoryPick(slug, cityName ?? "");
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);

  // Salons for the user's city only (if city is known)
  const citySalons = useMemo(
    () =>
      cityName ? salons.filter((s) => cityMatches(s.city, cityName)) : salons,
    [salons, cityName],
  );

  // All available slots for the city, sorted by time
  const allSlots = useMemo<QuickSlot[]>(() => {
    const seen = new Set<string>();
    const result: QuickSlot[] = [];

    function add(slot: QuickSlot) {
      const key = `${slot.salonId}-${slot.startTime}-${slot.serviceId ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(slot);
    }

    // Source 1: real nextSlots from salon profiles
    for (const salon of citySalons) {
      for (const slot of salon.nextSlots) {
        if (slotTooSoon(slot.startTime)) continue;
        // Try id first, then rawId (_id) — platform may store serviceId as MongoDB _id
        const svc =
          salon.services.find((s) => s.id === slot.serviceId) ??
          salon.services.find((s) => s.rawId === slot.serviceId);
        add({
          salonId: salon.id,
          salonName: salon.name,
          city: salon.city ?? cityName ?? "",
          startTime: slot.startTime,
          dateLabel: formatDateLabel(slot.startTime),
          serviceId: slot.serviceId,
          serviceName: svc?.name ?? "",
          serviceCategory: resolveCategoryLabel(svc?.category ?? ""),
          serviceDuration: svc?.duration,
          servicePrice: svc?.price,
          hasVariants: svc?.hasVariants,
          isSynthetic: false,
        });
      }
    }

    // Source 2: synthetic slots for services not covered by real nextSlots.
    // Runs for ALL salons — even those with real nextSlots, since those may
    // have null serviceId (free slots) and wouldn't carry service info.
    for (const salon of citySalons) {
      const hours = salon.workingHours ?? {};
      if (Object.keys(hours).length === 0) continue;

      // Services already represented by real nextSlots (by id or rawId)
      const coveredIds = new Set<string>();
      for (const slot of salon.nextSlots) {
        if (slot.serviceId) coveredIds.add(slot.serviceId);
      }

      const uncoveredSvcs = salon.services
        .filter((svc) => !coveredIds.has(svc.id) && !coveredIds.has(svc.rawId))
        .slice(0, 5);

      if (uncoveredSvcs.length === 0 && salon.nextSlots.length > 0) continue;

      if (uncoveredSvcs.length === 0) {
        // No services at all — generate generic free slots
        const gen = generateSlotsFromWorkingHours(salon, {
          serviceDuration: 60,
          daysAhead: 7,
          bufferMin: BUFFER_MIN,
        });
        for (const g of gen.slice(0, 3)) {
          add({
            salonId: salon.id,
            salonName: salon.name,
            city: salon.city ?? cityName ?? "",
            startTime: g.startTime,
            dateLabel: formatDateLabel(g.startTime),
            serviceId: null,
            serviceName: "",
            serviceCategory: "",
            isSynthetic: true,
          });
        }
      } else {
        for (const svc of uncoveredSvcs) {
          const gen = generateSlotsFromWorkingHours(salon, {
            serviceDuration: svc.duration,
            daysAhead: 7,
            bufferMin: BUFFER_MIN,
          });
          for (const g of gen.slice(0, 2)) {
            add({
              salonId: salon.id,
              salonName: salon.name,
              city: salon.city ?? cityName ?? "",
              startTime: g.startTime,
              dateLabel: formatDateLabel(g.startTime),
              serviceId: svc.id,
              serviceName: svc.name,
              serviceCategory: resolveCategoryLabel(svc.category),
              serviceDuration: svc.duration,
              servicePrice: svc.price,
              hasVariants: svc.hasVariants,
              isSynthetic: true,
            });
          }
        }
      }
    }

    // Source 3: slotsByCity from server search (filtered to user's city)
    for (const group of slotsByCity ?? []) {
      if (!cityMatches(group.city, cityName)) continue;
      for (const s of group.slots) {
        if (slotTooSoon(s.startTime)) continue;
        const sCity = s.city || group.city;
        if (!cityMatches(sCity, cityName)) continue;
        add({
          salonId: s.salonId,
          salonName: s.salonName,
          city: sCity,
          startTime: s.startTime,
          dateLabel: formatDateLabel(s.startTime),
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          serviceCategory: resolveCategoryLabel(
            typeof s.category === "string" ? s.category : "",
          ),
          serviceDuration: s.serviceDuration,
          servicePrice: s.price,
          hasVariants: s.hasVariants ?? false,
          isSynthetic: s.isSynthetic ?? false,
        });
      }
    }

    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [citySalons, slotsByCity, cityName]);

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
        return h >= timeWindowStart && (timeWindowEnd === undefined || h <= timeWindowEnd);
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

  // Apply service filter if one is active
  const displayedSlots = useMemo(() => {
    if (activeServiceId) {
      const filtered = subcategoryFilteredSlots.filter((s) => s.serviceId === activeServiceId);
      if (filtered.length > 0) return filtered.slice(0, 3);
    }
    return subcategoryFilteredSlots.slice(0, 3);
  }, [subcategoryFilteredSlots, activeServiceId]);

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

  const displayCity = cityName || displayedSlots[0]?.city || "";
  const hasSlots = displayedSlots.length > 0;
  const hasData =
    !loading && (citySalons.length > 0 || (slotsByCity?.length ?? 0) > 0);

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
      {loading ? (
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
            {category && SLUG_TO_CANONICAL[category as CategorySlug]
              ? `${SLUG_TO_CANONICAL[category as CategorySlug]} — ${displayCity}`
              : `Termini u — ${displayCity}`}
          </p>
          <div className="ms-slots-row">
            {displayedSlots.map((slot) => (
              <SlotCard
                key={`${slot.salonId}-${slot.startTime}-${slot.serviceId ?? ""}`}
                slot={slot}
                onBook={() => onPick(slot)}
              />
            ))}
          </div>
        </div>
      ) : category && SLUG_TO_CANONICAL[category as CategorySlug] ? (
        <CategoryNotFound
          category={SLUG_TO_CANONICAL[category as CategorySlug]!}
          categorySlug={category}
          city={displayCity}
          alternateCities={(slotsByCity ?? []).filter(
            (g) => g.city.toLowerCase() !== displayCity.toLowerCase() && g.slots.length > 0,
          )}
        />
      ) : (
        <RecoveryCTA city={displayCity} />
      )}

      {/* ── Categories — hidden when a search category is active ──────────── */}
      {!category && (hasData || loading) && (
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
            {loading &&
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

            {!loading &&
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

function SlotCard({ slot, onBook }: { slot: QuickSlot; onBook: () => void }) {
  const [hovered, setHovered] = useState(false);
  const timeStr = formatTime(slot.startTime);
  const priceStr = formatPrice(slot.servicePrice, slot.hasVariants);

  const serviceParts = [
    slot.serviceName || null,
    slot.serviceCategory || null,
    slot.serviceDuration ? `${slot.serviceDuration} min` : null,
  ].filter(Boolean);
  const serviceDetails = serviceParts.join(" · ");

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
        }}
      >
        {slot.dateLabel}
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
    <div style={{ marginBottom: 32, textAlign: "center", padding: "28px 24px" }}>
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 16,
          color: "var(--fg-1)",
          margin: "0 0 8px",
        }}
      >
        Nema slobodnih termina za {category}{city ? ` u ${city}` : ""}
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
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
                    (e.currentTarget as HTMLAnchorElement).style.background = "var(--secondary-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.background = "var(--secondary-color)";
                  }}
                >
                  {g.city}
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    {g.slots.length} {g.slots.length === 1 ? "termin" : "termina"}
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

function RecoveryCTA({ city }: { city: string }) {
  return (
    <div style={{ marginBottom: 40 }}>
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
        Nema slobodnih termina trenutno{city ? ` - ${city}` : ""}.
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
            Marija može pronaći prvi slobodan termin
          </p>
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 13,
              color: "var(--fg-3)",
              margin: "0 0 16px",
            }}
          >
            Marija prati otkazivanja i može automatski rezervisati prvi slobodan
            termin za vas.
          </p>
          <button
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
            Pronađi termin uz Mariju
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
