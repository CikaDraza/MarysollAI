"use client";

import { useState } from "react";
import {
  BoltIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface Props {
  visible: boolean;
  onBook: () => void;
  category?: string;
  time?: string;
  city?: string;
  salonName?: string;
}

export default function StickyOffer({
  visible,
  onBook,
  category = "Masaža",
  time = "14:00",
}: Props) {
  const [minimized, setMinimized] = useState(false);

  if (!visible) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        aria-label="Proširi baner"
        style={{
          position: "fixed",
          bottom: 22,
          left: 22,
          zIndex: 40,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#111114",
          color: "#fff",
          borderRadius: 999,
          padding: "10px 16px",
          boxShadow: "var(--shadow-lg)",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 13,
          transition: "opacity 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
        }}
      >
        <BoltIcon
          style={{ width: 16, height: 16, color: "var(--secondary-color)" }}
          strokeWidth={1.5}
        />
        {time}
        <ChevronUpIcon
          style={{ width: 14, height: 14, color: "#c4b6c2" }}
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 22,
        left: 22,
        zIndex: 40,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        background: "#111114",
        color: "#fff",
        borderRadius: 20,
        padding: "14px 16px",
        boxShadow: "var(--shadow-lg)",
        maxWidth: 380,
      }}
    >
      {/* Col 1 — Icon */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "999px",
          background: "var(--secondary-color)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <BoltIcon
          style={{ width: 18, height: 18, color: "#fff" }}
          strokeWidth={1.5}
        />
      </div>

      {/* Col 2 — Text */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#d57ed3",
          }}
        >
          Brzo
        </span>
        <span
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.4,
            color: "#fff",
          }}
        >
          Prvi slobodan termin u {time} – {category}
        </span>
      </div>

      {/* Col 3 — CTA + Minimize */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={onBook}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 12,
            padding: "9px 16px",
            borderRadius: 10,
            background: "var(--secondary-color)",
            color: "#fff",
            boxShadow: "var(--shadow-brand)",
            whiteSpace: "nowrap",
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--secondary-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--secondary-color)";
          }}
        >
          Rezerviši
        </button>

        <button
          onClick={() => setMinimized(true)}
          aria-label="Smanji"
          style={{
            background: "transparent",
            border: "none",
            color: "#c4b6c2",
            cursor: "pointer",
            width: 28,
            height: 28,
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background var(--dur-fast), color var(--dur-fast)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(255,255,255,.08)";
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#c4b6c2";
          }}
        >
          <ChevronDownIcon style={{ width: 14, height: 14 }} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
