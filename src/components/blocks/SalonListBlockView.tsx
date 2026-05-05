"use client";

import { useState } from "react";
import { CheckBadgeIcon, StarIcon } from "@heroicons/react/24/solid";
import { MapPinIcon } from "@heroicons/react/24/outline";
import type { SalonListBlockType, SalonItem } from "@/types/landing-block";
import { Reveal } from "@/components/motion/Reveal";

interface Props {
  block: SalonListBlockType;
  onActionComplete: (message: string) => void;
}

export default function SalonListBlockView({ block, onActionComplete }: Props) {
  const salons: SalonItem[] = block.metadata.salons ?? [];
  const city = block.metadata.city ?? "";
  const service = block.metadata.service ?? block.metadata.serviceName ?? "";

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
              onPick={() =>
                onActionComplete(
                  `Izabrao sam salon: ${salon.name}${city ? ` u ${city}` : ""}`,
                )
              }
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function SalonCard({
  salon,
  onPick,
}: {
  salon: SalonItem;
  onPick: () => void;
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

      {/* CTA */}
      <button
        onClick={onPick}
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
          marginTop: "auto",
        }}
      >
        Izaberi salon
      </button>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 12,
};
