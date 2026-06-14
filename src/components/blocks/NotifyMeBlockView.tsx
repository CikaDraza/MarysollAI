"use client";

import { useEffect } from "react";
import { Reveal } from "../motion/Reveal";

// The real "Obavesti me" form is the page section #notify-me (NotifyMeWidget).
// When Claudia offers NotifyMe (no slots / no salon), we scroll the user there
// instead of duplicating the form in the workspace — and show a short note so
// the workspace isn't empty.
export default function NotifyMeBlockView() {
  useEffect(() => {
    const el = document.getElementById("notify-me");
    if (!el) return;
    const timer = setTimeout(
      () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );
    return () => clearTimeout(timer);
  }, []);

  return (
    <Reveal>
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-1)",
          borderRadius: 16,
          padding: "16px 18px",
          fontFamily: "var(--main-font)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: 14,
            color: "var(--fg-1)",
          }}
        >
          Obaveštenje o terminu
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "var(--fg-3)",
            lineHeight: 1.45,
          }}
        >
          Ostavite kontakt u sekciji „Obavesti me" ispod — javljamo Vam čim se
          pojavi slobodan termin.
        </p>
      </div>
    </Reveal>
  );
}
