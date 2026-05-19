"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinIcon, ClockIcon, CurrencyEuroIcon } from "@heroicons/react/24/outline";
import type { BaseBlock } from "@/types/landing-block";
import type { SearchApiResponse, SearchResult } from "@/types/slots";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";

interface Props {
  block: BaseBlock;
  onActionComplete?: (m: string) => void;
}

export default function LandingSearchBlock({ block, onActionComplete }: Props) {
  const city = block.metadata.city ?? "";
  const service = block.metadata.service ?? block.metadata.serviceName ?? block.query ?? "";
  const date = block.metadata.date ?? "";
  const providedSlots = Array.isArray(block.metadata.slots)
    ? block.metadata.slots
    : null;
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (service) params.set("category", service);
  if (date) params.set("date", date);
  if (block.metadata.timeWindowStart != null) {
    params.set("timeWindowStart", String(block.metadata.timeWindowStart));
  }
  if (block.metadata.timeWindowEnd != null) {
    params.set("timeWindowEnd", String(block.metadata.timeWindowEnd));
  }

  const { data, isLoading } = useQuery<SearchApiResponse>({
    queryKey: [
      "landing-slots",
      city,
      service,
      date,
      block.metadata.timeWindowStart,
      block.metadata.timeWindowEnd,
    ],
    queryFn: () =>
      fetch(`/api/search?${params.toString()}`).then((r) => r.json()),
    staleTime: 60_000,
    enabled: !providedSlots,
  });

  if (isLoading) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            width: 28,
            height: 28,
            border: "3px solid var(--brand-100, #e9d5f9)",
            borderTopColor: "var(--secondary-color)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontSize: 13,
            color: "var(--fg-3)",
            marginTop: 12,
          }}
        >
          Tražim slobodne termine…
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const slotsByCity = providedSlots
    ? Object.values(
        providedSlots.reduce<Record<string, { city: string; slots: SearchResult[] }>>(
          (groups, slot) => {
            const key = slot.city || city || "Termini";
            groups[key] ??= { city: key, slots: [] };
            groups[key].slots.push(slot);
            return groups;
          },
          {},
        ),
      )
    : data?.slotsByCity ?? [];
  const totalSlots = slotsByCity.reduce((n, g) => n + g.slots.length, 0);

  if (totalSlots === 0) {
    return (
      <div
        style={{
          padding: "28px 0",
          textAlign: "center",
          fontFamily: "var(--main-font)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--fg-2)", margin: 0 }}>
          Nema slobodnih termina za{" "}
          <strong>{service || "odabranu uslugu"}</strong>
          {city ? ` u gradu ${city}` : ""}.
        </p>
        <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 6 }}>
          Pokušaj sa drugim datumom ili uslugom.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {slotsByCity.map(({ city: cityName, slots }) => (
        <div key={cityName}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
            }}
          >
            <MapPinIcon
              style={{ width: 14, height: 14, color: "var(--secondary-color)" }}
            />
            <span
              style={{
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 12,
                color: "var(--fg-2)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              {cityName}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {slots.slice(0, 5).map((slot) => (
              <SlotCard
                key={`${slot.salonId}-${slot.serviceId ?? ""}-${slot.startTime}`}
                slot={slot}
                onBook={() => {
                  sendSystemAction({
                    action: "SLOT_SELECTED",
                    source: "BookingWidget",
                    payload: { selectedSlot: slot },
                    notifyAgent: false,
                    visibleInThread: false,
                  });
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SlotCard({
  slot,
  onBook,
}: {
  slot: SearchResult;
  onBook: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 16,
        background: "var(--surface-2)",
        border: "1px solid var(--border-1, #f0ebf5)",
      }}
    >
      {slot.salonLogo ? (
        <img
          src={slot.salonLogo}
          alt={slot.salonName}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--brand-100, #f3e8ff)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--secondary-color)",
            }}
          >
            {slot.salonName.charAt(0)}
          </span>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 13,
            color: "var(--fg-1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {slot.salonName}
        </p>
        <p
          style={{
            margin: "2px 0 0",
            fontFamily: "var(--main-font)",
            fontSize: 11,
            color: "var(--fg-3)",
          }}
        >
          {slot.serviceName}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontFamily: "var(--main-font)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--secondary-color)",
            }}
          >
            <ClockIcon style={{ width: 11, height: 11 }} />
            {slot.dateLabel} · {slot.timeLabel}
          </span>
          {slot.price != null && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontFamily: "var(--main-font)",
                fontSize: 11,
                color: "var(--fg-3)",
              }}
            >
              <CurrencyEuroIcon style={{ width: 11, height: 11 }} />
              {slot.price.toLocaleString("sr-RS")} RSD
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onBook}
        style={{
          flexShrink: 0,
          border: "none",
          cursor: "pointer",
          padding: "8px 14px",
          borderRadius: 12,
          background: "var(--secondary-color)",
          color: "#fff",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 12,
          transition: "opacity 150ms",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
      >
        Zakaži
      </button>
    </div>
  );
}
