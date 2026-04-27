"use client";

import { useState } from "react";
import type { FlatSlot } from "@/types/slots";
import type { CitySlots } from "@/hooks/useSlotWindow";

interface Props {
  slotsByCity: CitySlots[];
  loading?: boolean;
  onBook: (slot: FlatSlot) => void;
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

export default function BookingWidget({ slotsByCity, loading, onBook }: Props) {
  const hasAny = slotsByCity.some((g) => g.slots.length > 0);

  return (
    <section id="booking-widget" style={{ marginTop: 56 }}>
      {/* Section header */}
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
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 14,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SlotSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasAny && (
        <p
          style={{
            textAlign: "center",
            fontFamily: "var(--main-font)",
            fontSize: 14,
            color: "var(--fg-3)",
            marginTop: 24,
          }}
        >
          Nema slobodnih termina za odabrane gradove.
        </p>
      )}

      {/* City groups */}
      {!loading &&
        slotsByCity
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
                Slobodni termini sada — {group.city}
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                  gap: 14,
                }}
              >
                {group.slots.map((slot, i) => (
                  <SlotCard
                    key={`${slot.salonId}-${slot.startTime}-${i}`}
                    slot={slot}
                    onBook={() => onBook(slot)}
                  />
                ))}
              </div>
            </div>
          ))}
    </section>
  );
}

/* ── Slot card ─────────────────────────────────────────────────────────────── */

function SlotCard({ slot, onBook }: { slot: FlatSlot; onBook: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        borderRadius: 20,
        padding: "18px 18px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
      }}
    >
      {/* Time */}
      <span
        style={{
          fontFamily: "var(--display-font)",
          fontWeight: 400,
          fontSize: 30,
          lineHeight: 1,
          color: "var(--fg-1)",
        }}
      >
        {formatTime(slot.startTime)}
      </span>

      {/* Salon + service */}
      <div>
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--fg-1)",
            margin: "0 0 2px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {slot.salonName}
        </p>
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 500,
            fontSize: 12,
            color: "var(--fg-3)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {slot.serviceName}
          {slot.distanceKm != null ? ` · ${slot.distanceKm.toFixed(1)} km` : ""}
        </p>
      </div>

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
          transition:
            "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          width: "100%",
        }}
      >
        Zakaži
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
        padding: "18px 18px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          width: 72,
          height: 30,
          borderRadius: 8,
          background: "var(--border)",
          opacity: 0.5,
        }}
      />
      <div>
        <div
          style={{
            width: "70%",
            height: 13,
            borderRadius: 6,
            background: "var(--border)",
            opacity: 0.5,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            width: "50%",
            height: 11,
            borderRadius: 6,
            background: "var(--border)",
            opacity: 0.3,
          }}
        />
      </div>
      <div
        style={{
          width: "100%",
          height: 34,
          borderRadius: 12,
          background: "var(--border)",
          opacity: 0.3,
        }}
      />
    </div>
  );
}
