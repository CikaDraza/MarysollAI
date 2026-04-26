"use client";

import { BoltIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onBook: () => void;
}

export default function StickyOffer({ visible, onDismiss, onBook }: Props) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 22, left: 22, zIndex: 40,
        display: "flex", alignItems: "center", gap: 12,
        background: "#111114", color: "#fff",
        borderRadius: 20, padding: "12px 14px 12px 12px",
        boxShadow: "var(--shadow-lg)", maxWidth: 380,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: "999px",
          background: "var(--secondary-color)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <BoltIcon style={{ width: 18, height: 18, color: "#fff" }} strokeWidth={1.5} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontFamily: "var(--main-font)", fontWeight: 700,
            fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
            color: "#d57ed3",
          }}
        >
          Brzo
        </span>
        <span
          style={{
            fontFamily: "var(--main-font)", fontWeight: 600, fontSize: 14,
          }}
        >
          Prvi slobodan termin u 14:00
        </span>
      </div>

      <button
        onClick={onBook}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          gap: 8, border: "none", cursor: "pointer",
          fontFamily: "var(--main-font)", fontWeight: 700,
          fontSize: 12, padding: "9px 14px", borderRadius: 10,
          background: "var(--secondary-color)", color: "#fff",
          boxShadow: "var(--shadow-brand)",
          transition: "background var(--dur-fast) var(--ease-out)",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-color)"; }}
      >
        Rezerviši
      </button>

      <button
        onClick={onDismiss}
        aria-label="Zatvori"
        style={{
          background: "transparent", border: "none",
          color: "#c4b6c2", cursor: "pointer",
          width: 26, height: 26, borderRadius: "999px",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "background var(--dur-fast), color var(--dur-fast)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#c4b6c2"; }}
      >
        <XMarkIcon style={{ width: 14, height: 14 }} strokeWidth={1.5} />
      </button>
    </div>
  );
}
