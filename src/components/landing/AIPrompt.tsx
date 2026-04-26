"use client";

import Image from "next/image";
import { SparklesIcon } from "@heroicons/react/24/outline";

interface Props {
  onOpenAI: () => void;
}

export default function AIPrompt({ onOpenAI }: Props) {
  return (
    <section style={{ marginTop: 56 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 18,
          background: "var(--surface-2)",
          border: "1px solid var(--brand-100)",
          borderRadius: 28,
          padding: "22px 24px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: "999px",
            overflow: "hidden", flexShrink: 0,
            position: "relative",
          }}
        >
          <Image
            src="/avatars/maria.png"
            alt="Maria"
            width={56}
            height={56}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 180 }}>
          <h2
            style={{
              fontFamily: "var(--main-font)", fontWeight: 700,
              fontSize: 22, lineHeight: 1.25,
              margin: "0 0 6px", color: "var(--fg-1)",
            }}
          >
            Ne znaš šta ti treba?
          </h2>
          <p
            style={{
              fontFamily: "var(--main-font)", fontWeight: 400,
              fontSize: 14, lineHeight: 1.5,
              color: "var(--fg-2)", margin: "4px 0 0", maxWidth: 420,
            }}
          >
            Maria može da rezerviše, prikaže slobodne termine i ispuni kalendar umesto tebe — uz jedan klik za potvrdu.
          </p>
        </div>

        <button
          onClick={onOpenAI}
          style={{
            marginLeft: "auto",
            display: "inline-flex", alignItems: "center", gap: 8,
            border: "none", cursor: "pointer",
            fontFamily: "var(--main-font)", fontWeight: 700,
            fontSize: 14, padding: "12px 18px", borderRadius: 14,
            background: "var(--surface)", color: "var(--fg-1)",
            boxShadow: "inset 0 0 0 1px var(--border-2)",
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-elev)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"; }}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          Pitaj Mariju
        </button>
      </div>
    </section>
  );
}
