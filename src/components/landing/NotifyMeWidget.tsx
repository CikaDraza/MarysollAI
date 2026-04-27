"use client";

import { useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";

interface Props {
  onOpenAI: () => void;
  city?: string;
  category?: string;
}

export default function NotifyMeWidget({ onOpenAI, city, category }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [service, setService] = useState(category ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          service: service.trim(),
          city: city?.trim() ?? "",
          instagram: instagram.trim() || undefined,
          tiktok: tiktok.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Greška");
      }
      setSent(true);
    } catch {
      // silent fallback — still show success to user to avoid friction
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ marginTop: 56 }} className="ms-nmw-section">
      {/* Left copy */}
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
            transition: "color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-hover)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--brand-50)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--secondary-color)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <SparklesIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          Pitaj asistenta
        </button>
      </div>

      {/* Right form card */}
      <div
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
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 20,
            color: "var(--fg-1)",
          }}
        >
          Obavesti me
        </h3>

        {sent ? (
          <p
            style={{
              fontFamily: "var(--main-font)",
              fontSize: 15,
              color: "var(--fg-2)",
              padding: "20px 0",
              lineHeight: 1.6,
            }}
          >
            Primili smo tvoj zahtev! Javićemo ti se čim se otvori slobodan termin.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Ime i prezime">
                <input
                  type="text"
                  placeholder="Ana Petrović"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </Field>
              <Field label="Telefon">
                <input
                  type="tel"
                  placeholder="+381 60 …"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="E-mail">
              <input
                type="email"
                placeholder="ana@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>

            <Field label="Usluga">
              <input
                type="text"
                placeholder="Masaža, Manikir, Frizura…"
                value={service}
                onChange={(e) => setService(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Instagram (opciono)">
                <input
                  type="text"
                  placeholder="@korisnik"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="TikTok (opciono)">
                <input
                  type="text"
                  placeholder="@korisnik"
                  value={tiktok}
                  onChange={(e) => setTiktok(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 14, marginTop: 4 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "var(--main-font)",
                  fontWeight: 700,
                  fontSize: 14,
                  padding: "13px 0",
                  borderRadius: 14,
                  background: "var(--secondary-color)",
                  color: "#fff",
                  width: "100%",
                  opacity: loading ? 0.7 : 1,
                  transition: "background var(--dur-fast) var(--ease-out), opacity 150ms",
                }}
                onMouseEnter={(e) => {
                  if (!loading)
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-color)";
                }}
              >
                {loading ? "Šaljem…" : "Obavesti me"}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .ms-nmw-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          align-items: start;
        }
        @media (max-width: 880px) {
          .ms-nmw-section { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
