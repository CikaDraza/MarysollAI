"use client";

import { useState } from "react";
import { MapPinIcon } from "@heroicons/react/24/solid";
import type { CityListBlockType, CityItem } from "@/types/landing-block";
import { Reveal } from "@/components/motion/Reveal";

interface Props {
  block: CityListBlockType;
  onActionComplete: (message: string) => void;
}

export default function CityListBlockView({ block, onActionComplete }: Props) {
  const cities: CityItem[] = block.metadata.cities ?? [];
  const service = block.metadata.service ?? block.metadata.serviceName ?? "";

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
          <Reveal key={city.name} delay={i * 0.05}>
            <CityCard
              city={city}
              onPick={() =>
                onActionComplete(`Izabrao sam grad: ${city.name}`)
              }
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function CityCard({
  city,
  onPick,
}: {
  city: CityItem;
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
          {city.salonCount != null && (
            <div
              style={{
                fontFamily: "var(--main-font)",
                fontSize: 11,
                color: "var(--fg-3)",
                fontWeight: 500,
                marginTop: 2,
              }}
            >
              {city.salonCount} salona
            </div>
          )}
        </div>
      </div>

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
        }}
      >
        Izaberi {city.name}
      </button>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: 12,
};
