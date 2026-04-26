"use client";

import { useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

const SLOTS = [
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

interface Props {
  onConfirm: () => void;
  onOpenAI: () => void;
}

export default function BookingWidget({ onConfirm, onOpenAI }: Props) {
  const [service, setService] = useState("Masaža leđa · 30 min");
  const [selectedSlot, setSelectedSlot] = useState("14:00");

  return (
    <section style={{ marginTop: 56 }} className="ms-bw-section">
      {/* Left copy block */}
      <div style={{ paddingTop: 12 }}>
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
          Nema termina?
        </p>
        <h2
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: "clamp(28px, 3.6vw, 38px)",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            margin: "6px 0 12px",
            color: "var(--fg-1)",
          }}
        >
          Svi termini su trenutno zauzeti? Želiš da te ubacimo na prvi slobodan?
          <br />
          <span
            style={{
              fontFamily: "var(--heading-font)",
              fontWeight: 400,
              color: "var(--secondary-color)",
            }}
          >
            Obavesti me
          </span>{" "}
          opcija rešava problem
        </h2>
        <h3
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 300,
            fontSize: 20,
            lineHeight: 1.55,
            color: "var(--fg-2)",
            margin: "0 0 18px",
            maxWidth: 380,
          }}
        >
          Ostavi ime i broj — Obaveštavamo te sa prvim slobodnim terminom.
        </h3>
        <button
          className="hero-search-btn mr-4"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 18px",
            borderRadius: 14,
            background: "var(--secondary-color)",
            color: "#fff",
            boxShadow: "var(--shadow-brand)",
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
          Obavesti me
        </button>
        <button
          onClick={onOpenAI}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            padding: "12px 18px",
            borderRadius: 14,
            color: "var(--secondary-color)",
            transition:
              "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--secondary-hover)";
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--brand-50)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--secondary-color)";
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          Pitaj asistenta
        </button>
      </div>

      {/* Right booking card */}
      <div
        id="booking-widget"
        style={{
          background: "var(--surface)",
          borderRadius: 28,
          padding: 22,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 20,
              color: "var(--fg-1)",
            }}
          >
            Zakaži termin
          </h3>
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 500,
              fontSize: 12,
              color: "var(--fg-3)",
              padding: "4px 10px",
              background: "var(--surface-2)",
              borderRadius: 999,
            }}
          >
            Studio Lavanda
          </span>
        </div>

        {/* Service select */}
        <Field label="Usluga">
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={inputStyle}
          >
            <option>Masaža leđa · 30 min</option>
            <option>Masaža celog tela · 60 min</option>
            <option>Tretman lica</option>
            <option>Šišanje</option>
          </select>
        </Field>

        {/* Date + Phone */}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <Field label="Datum">
            <input
              type="text"
              defaultValue="Sreda, 14. maj"
              style={inputStyle}
            />
          </Field>
          <Field label="Telefon">
            <input type="tel" placeholder="+381 …" style={inputStyle} />
          </Field>
        </div>

        {/* Name */}
        <Field label="Ime">
          <input type="text" placeholder="Marija Petrović" style={inputStyle} />
        </Field>

        {/* Slot grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
          }}
        >
          {SLOTS.map((t) => (
            <SlotButton
              key={t}
              time={t}
              active={selectedSlot === t}
              onClick={() => setSelectedSlot(t)}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border-1)",
            paddingTop: 14,
            marginTop: 4,
          }}
        >
          <span
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 800,
              fontSize: 22,
              color: "var(--fg-1)",
            }}
          >
            2 400 RSD
          </span>
          <button
            onClick={onConfirm}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 14,
              padding: "12px 18px",
              borderRadius: 14,
              background: "#111114",
              color: "#fff",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#2A1828";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#111114";
            }}
          >
            Zakaži termin
          </button>
        </div>
      </div>

      <style>{`
        .ms-bw-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: start;
        }
        @media (max-width: 880px) {
          .ms-bw-section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 600,
          fontSize: 11,
          color: "var(--fg-2)",
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--main-font)",
  fontWeight: 500,
  fontSize: 14,
  color: "var(--fg-1)",
  background: "var(--surface-2)",
  border: "none",
  borderRadius: 14,
  padding: "13px 14px",
  outline: "2px solid transparent",
  transition: "outline-color 180ms, background 180ms",
  width: "100%",
};

function SlotButton({
  time,
  active,
  onClick,
}: {
  time: string;
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
        background: active
          ? "var(--secondary-color)"
          : hovered
            ? "var(--brand-100)"
            : "var(--surface-2)",
        border: "none",
        borderRadius: 12,
        padding: "10px 0",
        fontFamily: "var(--main-font)",
        fontWeight: 500,
        fontSize: 13,
        color: active ? "#fff" : "var(--fg-1)",
        cursor: "pointer",
        transition: "background 150ms, color 150ms",
      }}
    >
      {time}
    </button>
  );
}
