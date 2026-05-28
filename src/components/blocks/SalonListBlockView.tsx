"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckBadgeIcon, StarIcon } from "@heroicons/react/24/solid";
import { MapPinIcon } from "@heroicons/react/24/outline";
import type { SalonListBlockType, SalonItem } from "@/types/landing-block";
import type { SearchApiResponse } from "@/types/slots";
import { Reveal } from "@/components/motion/Reveal";
import { bookingFlow, useBookingFlow } from "@/lib/ai/booking-flow-state";
import { blockActionToSystemAction } from "@/lib/ai/layout/blockActionToSystemAction";
import { executeUICommand } from "@/lib/ai/ui/ui-command-executor";

interface Props {
  block: SalonListBlockType;
  onActionComplete: (message: string, payload?: Record<string, unknown>) => void;
}

export default function SalonListBlockView({ block }: Props) {
  const city = block.metadata.city ?? "";
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
  const providedSalons: SalonItem[] = block.metadata.salons ?? [];

  const { data, isLoading } = useQuery<SearchApiResponse>({
    queryKey: ["salon-list", city, service, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (service) {
        params.set("query", service);
        params.set("service", service);
      }
      if (category) params.set("category", category);
      params.set("limit", "50");
      return fetch(`/api/search?${params.toString()}`).then((r) => r.json());
    },
    staleTime: 60_000,
    enabled: providedSalons.length === 0 && Boolean(city && service),
  });

  const fetchedSalons: SalonItem[] = [];
  const seen = new Set<string>();
  for (const slot of data?.results ?? []) {
    if (seen.has(slot.salonId)) continue;
    seen.add(slot.salonId);
    fetchedSalons.push({
      id: slot.salonId,
      name: slot.salonName,
      address: slot.salonAddress,
      rating: slot.rating,
      verified: slot.verified,
    });
  }
  const salons = providedSalons.length > 0 ? providedSalons : fetchedSalons;

  if (providedSalons.length === 0 && isLoading) {
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

  if (salons.length === 0) {
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
        Nema pronađenih salona u ovom gradu.
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
        {service && city
          ? `${service} · ${city}`
          : city || service || "Saloni"}
      </p>
      <div style={gridStyle}>
        {salons.map((salon, i) => (
          <Reveal key={salon.id} delay={i * 0.05}>
            <SalonCard
              salon={salon}
              disabled={disabled}
              onPick={(selectedService) => {
                if (disabled) {
                  console.debug("[STALE_BLOCK_ACTION_IGNORED]", {
                    blockType: "SalonListBlock",
                    blockFlowVersion,
                    currentFlowVersion,
                  });
                  return;
                }
                setConsumed(true);
                // Phase 2 Task 10 — hydrate bookingFlow from UI selection.
                bookingFlow.get().collect({
                  salonId: salon.id,
                  salonName: salon.name,
                  serviceId: selectedService?.serviceId,
                  serviceName: selectedService?.serviceName,
                  service: selectedService?.serviceName ?? service,
                  category: selectedService?.category ?? category,
                  subcategory: selectedService?.subcategory,
                  date: block.metadata.date,
                  time: block.metadata.time,
                  timeWindowStart: block.metadata.timeWindowStart,
                  timeWindowEnd: block.metadata.timeWindowEnd,
                  ...(city ? { city } : {}),
                });
                const payload = {
                  intent: "select_salon",
                  city,
                  service: selectedService?.serviceName ?? service,
                  serviceId: selectedService?.serviceId,
                  serviceName: selectedService?.serviceName,
                  category: selectedService?.category ?? category,
                  subcategory: selectedService?.subcategory,
                  salonId: salon.id,
                  salonName: salon.name,
                  date: block.metadata.date,
                  time: block.metadata.time,
                  timeWindowStart: block.metadata.timeWindowStart,
                  timeWindowEnd: block.metadata.timeWindowEnd,
                  flowVersion: block.metadata.flowVersion,
                };
                executeUICommand({
                  type: "OPEN_DRAWER",
                  reason: "salon_selected",
                });
                const action = selectedService
                  ? "service_selected_for_salon"
                  : "salon_selected";
                blockActionToSystemAction("SalonListBlock", action, payload);
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

function SalonCard({
  salon,
  onPick,
  disabled,
}: {
  salon: SalonItem;
  onPick: (service?: NonNullable<SalonItem["matchingServices"]>[number]) => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const matchingServices = salon.matchingServices ?? [];

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
        gap: 0,
        boxShadow: hovered ? "var(--shadow-md)" : "none",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
        cursor: "default",
      }}
    >
      {/* Name + verified */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginBottom: 4,
        }}
      >
        <h3
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--fg-1)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {salon.name}
        </h3>
        {salon.verified && (
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

      {/* Address */}
      {salon.address && (
        <p
          style={{
            fontFamily: "var(--main-font)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--fg-3)",
            margin: "0 0 10px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <MapPinIcon style={{ width: 11, height: 11, flexShrink: 0 }} />
          {salon.address}
        </p>
      )}

      {/* Rating row */}
      {salon.rating != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 14,
          }}
        >
          <StarIcon
            style={{ width: 12, height: 12, color: "#f59e0b" }}
          />
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--fg-1)",
            }}
          >
            {salon.rating.toFixed(1)}
          </span>
          {salon.reviewCount != null && (
            <span
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 11,
                color: "var(--fg-3)",
                fontWeight: 500,
              }}
            >
              ({salon.reviewCount})
            </span>
          )}
        </div>
      )}

      {/* Spacer when no rating or address */}
      {salon.rating == null && !salon.address && (
        <div style={{ flex: 1, minHeight: 14 }} />
      )}

      {matchingServices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "2px 0 14px" }}>
          {matchingServices.slice(0, 4).map((service) => (
            <button
              key={`${service.serviceId ?? service.serviceName}-${service.matchReason}`}
              onClick={() => onPick(service)}
              disabled={disabled}
              style={{
                border: "1px solid var(--border-1, #f0ebf5)",
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "var(--main-font)",
                textAlign: "left",
                borderRadius: 12,
                padding: "9px 10px",
                background: disabled ? "var(--surface-3, #f5f3f7)" : "#fff",
                color: disabled ? "var(--fg-3)" : "var(--fg-1)",
              }}
            >
              <span style={{ display: "block", fontWeight: 700, fontSize: 12 }}>
                {service.serviceName}
              </span>
              <span style={{ display: "block", marginTop: 2, fontWeight: 500, fontSize: 11, color: "var(--fg-3)" }}>
                {disabled ? "Izabrano" : [service.duration ? `${service.duration} min` : "", service.price ? `${service.price.toLocaleString("sr-RS")} RSD` : ""]
                  .filter(Boolean)
                  .join(" · ") || "Prikaži termine"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* CTA */}
      {matchingServices.length === 0 && <button
        onClick={() => onPick()}
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
          marginTop: "auto",
        }}
      >
        {disabled ? "Izabrano" : "Izaberi salon"}
      </button>}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 12,
};

const consumedNoteStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontFamily: "var(--main-font)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg-3)",
};
