"use client";

import { useState } from "react";
import { MapPinIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import type { CityListBlockType } from "@/types/landing-block";
import type { SearchApiResponse } from "@/types/slots";
import { Reveal } from "@/components/motion/Reveal";
import { bookingFlow, useBookingFlow } from "@/lib/ai/booking-flow-state";
import { blockActionToSystemAction } from "@/lib/ai/layout/blockActionToSystemAction";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";

interface Props {
  block: CityListBlockType;
  onActionComplete: (message: string, payload?: Record<string, unknown>) => void;
}

interface CityEntry {
  name: string;
  slotCount: number;
}

export default function CityListBlockView({ block }: Props) {
  const service = block.metadata.service ?? block.metadata.serviceName ?? "";
  const category = block.metadata.category ?? "";
  const currentFlowVersion = useBookingFlow((state) => state.flowVersion);
  const blockFlowVersion =
    typeof block.metadata.flowVersion === "number"
      ? block.metadata.flowVersion
      : currentFlowVersion;
  const [consumed, setConsumed] = useState(false);
  const stale = blockFlowVersion < currentFlowVersion;
  const disabled = consumed || stale;
  const providedCities: CityEntry[] = (block.metadata.cities ?? []).map((city) => ({
    name: city.name,
    slotCount: city.salonCount ?? 0,
  }));

  const { data, isLoading } = useQuery<SearchApiResponse>({
    queryKey: ["city-list", service],
    queryFn: () => {
      const params = new URLSearchParams();
      if (service) params.set("query", service);
      if (service) params.set("service", service);
      if (category) params.set("category", category);
      return fetch(`/api/search?${params.toString()}`).then((r) => r.json());
    },
    staleTime: 60_000,
    enabled: providedCities.length === 0,
  });

  const cities: CityEntry[] =
    providedCities.length > 0
      ? providedCities
      : (data?.slotsByCity ?? []).map(({ city, slots }) => ({
          name: city,
          slotCount: slots.length,
        }));

  if (providedCities.length === 0 && isLoading) {
    return (
      <div style={{ padding: "28px 0", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            width: 24,
            height: 24,
            border: "3px solid var(--brand-100, #e9d5f9)",
            borderTopColor: "var(--secondary-color)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "32px 0",
          fontFamily: "var(--main-font)",
          color: "var(--fg-3)",
          fontSize: 14,
        }}
      >
        Nema dostupnih gradova za odabranu uslugu.
      </div>
    );
  }

  return (
    <div>
      <p
        style={{
          fontFamily: "var(--main-font)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: ".1em",
          margin: "0 0 14px",
        }}
      >
        {service ? `${service} — dostupno u` : "Dostupno u gradovima"}
      </p>
      <div style={gridStyle}>
        {cities.map((city, i) => (
          <Reveal key={`${city.name}-${i}`} delay={i * 0.05}>
            <CityCard
              city={city}
              disabled={disabled}
              onPick={() => {
                if (disabled) {
                  console.debug("[STALE_BLOCK_ACTION_IGNORED]", {
                    blockType: "CityListBlock",
                    blockFlowVersion,
                    currentFlowVersion,
                  });
                  return;
                }
                setConsumed(true);
                // Phase 2 Task 10 — hydrate bookingFlow from UI selection so
                // the next Claudia turn won't re-ask for city.
                bookingFlow.get().collect({ city: city.name });
                const payload = {
                  intent: "select_city",
                  city: city.name,
                  service,
                  category,
                  date: block.metadata.date,
                  time: block.metadata.time,
                  timeWindowStart: block.metadata.timeWindowStart,
                  timeWindowEnd: block.metadata.timeWindowEnd,
                  flowVersion: block.metadata.flowVersion,
                };
                executeUICommand({
                  type: "OPEN_DRAWER",
                  reason: "city_selected",
                });
                blockActionToSystemAction("CityListBlock", "city_selected", payload);
              }}
            />
          </Reveal>
        ))}
      </div>
      {disabled && (
        <p style={consumedNoteStyle}>
          Izabrano
        </p>
      )}
    </div>
  );
}

function CityCard({
  city,
  onPick,
  disabled,
}: {
  city: CityEntry;
  onPick: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface-2)",
        borderRadius: 20,
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: hovered ? "var(--shadow-md)" : "none",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "999px",
            background: hovered
              ? "var(--secondary-color)"
              : "var(--brand-100, #f3e8ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
        >
          <MapPinIcon
            style={{
              width: 18,
              height: 18,
              color: hovered ? "#fff" : "var(--secondary-color)",
              transition: "color var(--dur-fast) var(--ease-out)",
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--fg-1)",
              lineHeight: 1.2,
            }}
          >
            {city.name}
          </div>
          {city.slotCount > 0 && (
            <div
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 11,
                color: "var(--fg-3)",
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              {city.slotCount} slobodnih termina
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onPick}
        disabled={disabled}
        style={{
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 13,
          padding: "10px 0",
          borderRadius: 12,
          background: disabled
            ? "var(--surface-3, #f5f3f7)"
            : hovered
            ? "var(--secondary-color)"
            : "var(--brand-100, #f3e8ff)",
          color: disabled ? "var(--fg-3)" : hovered ? "#fff" : "var(--secondary-color)",
          transition:
            "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
          width: "100%",
        }}
      >
        {disabled ? "Izabrano" : `Izaberi ${city.name}`}
      </button>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: 12,
};

const consumedNoteStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontFamily: "var(--main-font)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg-3)",
};
