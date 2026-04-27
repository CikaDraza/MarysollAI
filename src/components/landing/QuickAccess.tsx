"use client";

import { useMemo, useState } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";
import type { MappedSalon } from "@/lib/mappers/salonMapper";
import { CANONICAL_TO_SLUG } from "@/lib/intent/categoryMap";
import { getCategoryLabel } from "@/lib/categories/getCategoryLabel";

interface Props {
  salons: MappedSalon[];
  loading?: boolean;
  category: string;
  onPick: () => void;
  onCategoryPick: (category: string) => void;
}

interface QuickSlot {
  salonId: string;
  salonName: string;
  city: string;
  startTime: string;
  serviceId: string | null;
  serviceName: string;
  serviceCategory: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("sr-Latn", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

export default function QuickAccess({ salons, loading, category, onPick, onCategoryPick }: Props) {
  const quickSlots = useMemo<QuickSlot[]>(() => {
    const flat: QuickSlot[] = [];
    for (const salon of salons) {
      for (const slot of salon.nextSlots) {
        const svc = salon.services.find((s) => s.id === slot.serviceId);
        flat.push({
          salonId: salon.id,
          salonName: salon.name,
          city: salon.city ?? "",
          startTime: slot.startTime,
          serviceId: slot.serviceId,
          serviceName: svc?.name ?? "Slobodan termin",
          serviceCategory: svc?.category ?? "",
        });
      }
    }
    return flat.sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 3);
  }, [salons]);

  const categories = useMemo<{ slug: string; label: string; count: number }[]>(() => {
    const map = new Map<string, number>();
    for (const salon of salons) {
      for (const svc of salon.services) {
        if (!svc.category) continue;
        const slug = CANONICAL_TO_SLUG[svc.category] ?? "other";
        map.set(slug, (map.get(slug) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([slug, count]) => ({ slug, label: getCategoryLabel(slug), count }));
  }, [salons]);

  const hasData = !loading && salons.length > 0;

  return (
    <section style={{ marginTop: 64 }}>
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

      {/* ── Quick slots ─────────────────────────────────────────────────────── */}
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
          Slobodni termini sada
        </p>

        <div className="ms-slots-row">
          {loading && [0, 1, 2].map((i) => <SlotSkeleton key={i} />)}

          {!loading && quickSlots.length === 0 && (
            <p
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 14,
                color: "var(--fg-3)",
                padding: "20px 0",
              }}
            >
              Nema slobodnih termina za prikaz. Pokušaj da pretražiš po gradu.
            </p>
          )}

          {quickSlots.map((slot) => (
            <SlotCard key={`${slot.salonId}-${slot.startTime}`} slot={slot} onBook={onPick} />
          ))}
        </div>
      </div>

      {/* ── Category grid ─────────────────────────────────────────────────── */}
      {(hasData || loading) && (
        <div>
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

          <div className="ms-cat-grid">
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="ms-cat-skeleton"
                  style={{
                    height: 64,
                    borderRadius: 16,
                    background: "var(--surface-2, var(--surface))",
                    opacity: 0.6,
                  }}
                />
              ))}

            {!loading &&
              categories.map((cat) => (
                <CategoryChip
                  key={cat.slug}
                  name={cat.label}
                  count={cat.count}
                  active={category === cat.slug}
                  onClick={() =>
                    onCategoryPick(category === cat.slug ? "" : cat.slug)
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
        .ms-cat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        @media (max-width: 700px) {
          .ms-slots-row { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .ms-cat-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </section>
  );
}

/* ── Slot card ─────────────────────────────────────────────────────────────── */

function SlotCard({ slot, onBook }: { slot: QuickSlot; onBook: () => void }) {
  const [hovered, setHovered] = useState(false);

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
        gap: 12,
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
      }}
    >
      {/* Time badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--display-font)",
            fontWeight: 400,
            fontSize: 32,
            lineHeight: 1,
            color: "var(--fg-1)",
          }}
        >
          {formatTime(slot.startTime)}
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
            }}
          >
            {slot.city}
          </span>
        )}
      </div>

      {/* Salon + service */}
      <div>
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--fg-1)",
            margin: "0 0 2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {slot.salonName}
        </p>
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 500,
            fontSize: 13,
            color: "var(--fg-3)",
            margin: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {slot.serviceName}
          {slot.serviceCategory ? ` · ${slot.serviceCategory}` : ""}
        </p>
      </div>

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
          background: hovered ? "var(--secondary-color)" : "var(--brand-100, #f3e8ff)",
          color: hovered ? "#fff" : "var(--secondary-color)",
          transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          width: "100%",
        }}
      >
        Rezerviši
      </button>
    </div>
  );
}

/* ── Slot skeleton ─────────────────────────────────────────────────────────── */

function SlotSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        padding: "20px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ width: 72, height: 32, borderRadius: 8, background: "var(--border)", opacity: 0.5 }} />
        <div style={{ width: 50, height: 20, borderRadius: 10, background: "var(--border)", opacity: 0.4 }} />
      </div>
      <div>
        <div style={{ width: "70%", height: 14, borderRadius: 6, background: "var(--border)", opacity: 0.5, marginBottom: 6 }} />
        <div style={{ width: "50%", height: 12, borderRadius: 6, background: "var(--border)", opacity: 0.3 }} />
      </div>
      <div style={{ width: "100%", height: 36, borderRadius: 12, background: "var(--border)", opacity: 0.3 }} />
    </div>
  );
}

/* ── Category chip ─────────────────────────────────────────────────────────── */

function CategoryChip({
  name,
  count,
  active,
  onClick,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: active ? "2px solid var(--secondary-color)" : "2px solid transparent",
        cursor: "pointer",
        fontFamily: "var(--main-font)",
        textAlign: "left",
        borderRadius: 16,
        padding: "14px 16px",
        background: active
          ? "var(--brand-100, #f3e8ff)"
          : hovered
          ? "var(--surface-hover, var(--surface))"
          : "var(--surface)",
        boxShadow: hovered || active ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hovered && !active ? "translateY(-1px)" : "translateY(0)",
        transition: "all var(--dur-fast) var(--ease-out)",
      }}
    >
      <span
        style={{
          display: "block",
          fontWeight: 700,
          fontSize: 14,
          color: active ? "var(--secondary-color)" : "var(--fg-1)",
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span
        style={{
          display: "block",
          fontWeight: 500,
          fontSize: 12,
          color: "var(--fg-3)",
        }}
      >
        {count} {count === 1 ? "usluga" : count < 5 ? "usluge" : "usluga"}
      </span>
    </button>
  );
}
