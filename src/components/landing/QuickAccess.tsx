"use client";

import { useState } from "react";

const CATEGORIES = [
  {
    id: "nokti",
    label: "Nokti",
    meta: "Dizajn i Frenč · Gel lak · Izlivanje · Korekcija",
    img: "/salons/nails-kikikiss.jpg",
  },
  {
    id: "sminka",
    label: "Šminka",
    meta: "Šminkanje · Čupanje obrva",
    img: "/salons/makeup-belisimo.png",
  },
];

interface Props {
  onPick: () => void;
}

export default function QuickAccess({ onPick }: Props) {
  return (
    <section style={{ marginTop: 64 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
          maxWidth: 640,
          margin: "0 auto",
        }}
        className="ms-quick-grid"
      >
        {CATEGORIES.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} onClick={onPick} />
        ))}
      </div>

      <style>{`
        @media (max-width: 540px) {
          .ms-quick-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function CategoryCard({
  cat,
  onClick,
}: {
  cat: (typeof CATEGORIES)[number];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface)",
        border: "none",
        borderRadius: 22,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-sm)",
        cursor: "pointer",
        textAlign: "left",
        overflow: "hidden",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition:
          "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: 180,
          width: "100%",
          backgroundImage: `url(${cat.img})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "var(--brand-100)",
        }}
      />
      <span
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 700,
          fontSize: 18,
          color: "var(--fg-1)",
          padding: "14px 16px 2px",
          display: "block",
        }}
      >
        {cat.label}
      </span>
      <span
        style={{
          fontFamily: "var(--main-font)",
          fontWeight: 500,
          fontSize: 13,
          color: "var(--fg-3)",
          padding: "0 16px 16px",
          display: "block",
        }}
      >
        {cat.meta}
      </span>
    </button>
  );
}
