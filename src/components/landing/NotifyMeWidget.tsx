"use client";

import { useEffect, useMemo, useState } from "react";
import { BellAlertIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useCityContext } from "@/context/landing/CityContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useAuthActions } from "@/hooks/useAuthActions";

type PreferredTimeMode = "anytime" | "today" | "tomorrow";
type TimeRelation = "before" | "after";
type BrowserPushSubscription = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function hourFromTime(value: string): number | undefined {
  const hour = Number(value.slice(0, 2));
  return Number.isFinite(hour) ? hour : undefined;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer;
}

export default function NotifyMeWidget() {
  const { setDrawerOpen } = useLandingUI();
  const { cityName } = useCityContext();
  const { category } = useFilters();
  const { user } = useAuthActions();
  const onOpenAI = () => setDrawerOpen(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [service, setService] = useState(category ?? "");
  const [city, setCity] = useState(cityName ?? "");
  const [salon, setSalon] = useState("");
  const [preferredTimeMode, setPreferredTimeMode] = useState<PreferredTimeMode>("anytime");
  const [timeRelation, setTimeRelation] = useState<TimeRelation>("after");
  const [selectedTime, setSelectedTime] = useState("15:00");
  const [pushAllowed, setPushAllowed] = useState(false);
  const [pushSubscription, setPushSubscription] =
    useState<BrowserPushSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cityName) setCity(cityName);
  }, [cityName]);

  useEffect(() => {
    if (category && !service) setService(category);
  }, [category, service]);

  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.name || "");
    setEmail((current) => current || user.email || "");
    setPhone((current) => current || user.phone || user.phoneNumber || "");
    setInstagram((current) => current || user.instagram || user.instagramUsername || "");
  }, [user]);

  const isLoggedIn = Boolean(user?.id);
  const contactHint = useMemo(() => {
    if (isLoggedIn) return "Kontakt je opcioni override za postojeći nalog.";
    return "Za goste je potrebno ime i bar jedan kontakt.";
  }, [isLoggedIn]);

  async function requestBrowserPush() {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setError("Browser push nije podržan u ovom browseru.");
      return;
    }
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError("Browser push nije podešen na serveru.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushAllowed(false);
      setPushSubscription(null);
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
      }));
    setPushAllowed(true);
    setPushSubscription(subscription.toJSON() as BrowserPushSubscription);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedInstagram = instagram.trim();
    const trimmedTiktok = tiktok.trim();
    const hasAnyContact = Boolean(trimmedEmail || trimmedPhone || trimmedInstagram || trimmedTiktok);

    if (!service.trim() || !city.trim()) {
      setError("Usluga i grad su obavezni.");
      return;
    }
    if (!isLoggedIn && (!trimmedName || !hasAnyContact)) {
      setError("Unesite ime i bar jedan kontakt: email, telefon, Instagram ili TikTok.");
      return;
    }

    const cutoffHour = preferredTimeMode === "anytime" ? undefined : hourFromTime(selectedTime);
    const preferredDate =
      preferredTimeMode === "today"
        ? todayIso()
        : preferredTimeMode === "tomorrow"
          ? todayIso(1)
          : undefined;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("assistant_token") : null;

    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: trimmedName || undefined,
          phone: trimmedPhone || undefined,
          email: trimmedEmail || undefined,
          serviceName: service.trim(),
          city: city.trim(),
          salonName: salon.trim() || undefined,
          preferredTimeMode,
          preferredDate,
          timeWindowStart:
            cutoffHour != null && timeRelation === "after" ? cutoffHour : undefined,
          timeWindowEnd:
            cutoffHour != null && timeRelation === "before" ? cutoffHour : undefined,
          instagram: trimmedInstagram || undefined,
          tiktok: trimmedTiktok || undefined,
          pushAllowed,
          pushSubscription: pushSubscription ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Slanje trenutno nije uspelo.");
      }
      setSent(true);
      if (pushAllowed && "Notification" in window) {
        new Notification("Marysoll", {
          body: "Javićemo ti čim se pojavi slobodan termin.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slanje trenutno nije uspelo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="notify-me" style={{ marginTop: 56 }} className="ms-nmw-section">
      <div style={{ paddingTop: 12 }}>
        <p className="ms-nmw-eyebrow">Nema termina?</p>
        <h2 className="ms-nmw-title">
          Nema slobodnih termina za ovu uslugu.
          <br />
          <span>Možemo da te obavestimo</span> čim se pojavi prvi slobodan termin.
        </h2>
        <p className="ms-nmw-copy">
          Ostavi uslugu, grad i željeni vremenski okvir. Ne rezervišemo automatski;
          šaljemo link da potvrdiš termin kada se pojavi.
        </p>
        <button type="button" onClick={onOpenAI} className="ms-nmw-ai">
          <SparklesIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          Pitaj asistenta
        </button>
      </div>

      <div className="ms-nmw-card">
        <div className="ms-nmw-card-head">
          <h3>Obavesti me</h3>
          <button type="button" onClick={requestBrowserPush} className="ms-nmw-icon-btn">
            <BellAlertIcon style={{ width: 18, height: 18 }} strokeWidth={1.7} />
            <span>{pushAllowed ? "Browser uključen" : "Browser push"}</span>
          </button>
        </div>

        {sent ? (
          <p className="ms-nmw-success">
            Primili smo tvoj zahtev. Javljamo čim se pojavi slobodan termin za
            {service ? ` ${service}` : " izabranu uslugu"}
            {city ? ` u ${city}` : ""}.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="ms-nmw-form">
            <div className="ms-nmw-grid">
              <Field label="Ime i prezime">
                <input
                  type="text"
                  placeholder="Ana Petrović"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLoggedIn}
                  style={inputStyle}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  placeholder="ana@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>

            <div className="ms-nmw-grid">
              <Field label="Usluga">
                <input
                  type="text"
                  placeholder="Šminkanje, masaža, manikir…"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  required
                  style={inputStyle}
                />
              </Field>
              <Field label="Grad">
                <input
                  type="text"
                  placeholder="Beograd"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Salon (opciono)">
              <input
                type="text"
                placeholder="Ako želiš baš određeni salon"
                value={salon}
                onChange={(e) => setSalon(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <div>
              <span className="ms-nmw-label">Preferirano vreme</span>
              <div className="ms-nmw-segments">
                <SegmentButton active={preferredTimeMode === "anytime"} onClick={() => setPreferredTimeMode("anytime")}>
                  Bilo kada
                </SegmentButton>
                <SegmentButton active={preferredTimeMode === "today"} onClick={() => setPreferredTimeMode("today")}>
                  Danas
                </SegmentButton>
                <SegmentButton active={preferredTimeMode === "tomorrow"} onClick={() => setPreferredTimeMode("tomorrow")}>
                  Sutra
                </SegmentButton>
              </div>
              {preferredTimeMode !== "anytime" && (
                <div className="ms-nmw-time-row">
                  <SegmentButton active={timeRelation === "before"} onClick={() => setTimeRelation("before")}>
                    Pre
                  </SegmentButton>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    style={inputStyle}
                  />
                  <SegmentButton active={timeRelation === "after"} onClick={() => setTimeRelation("after")}>
                    Posle
                  </SegmentButton>
                </div>
              )}
            </div>

            <div className="ms-nmw-grid">
              <Field label="Telefon">
                <input
                  type="tel"
                  placeholder="+381 60 …"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Instagram">
                <input
                  type="text"
                  placeholder="@korisnik"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="TikTok">
              <input
                type="text"
                placeholder="@korisnik"
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <p className="ms-nmw-hint">{contactHint}</p>
            {error && <p className="ms-nmw-error">{error}</p>}

            <button type="submit" disabled={loading} className="ms-nmw-submit">
              {loading ? "Šaljem…" : "Obavesti me"}
            </button>
          </form>
        )}
      </div>

      <style>{`
        .ms-nmw-section {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr);
          gap: 40px;
          align-items: start;
        }
        .ms-nmw-eyebrow {
          font-family: var(--main-font);
          font-weight: 600;
          font-size: 12px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--secondary-color);
          margin: 0 0 6px;
        }
        .ms-nmw-title {
          font-family: var(--main-font);
          font-weight: 700;
          font-size: clamp(28px, 3.6vw, 38px);
          line-height: 1.15;
          letter-spacing: 0;
          margin: 6px 0 12px;
          color: var(--fg-1);
        }
        .ms-nmw-title span {
          font-family: var(--heading-font);
          font-weight: 400;
          color: var(--secondary-color);
        }
        .ms-nmw-copy {
          font-family: var(--main-font);
          font-weight: 300;
          font-size: 18px;
          line-height: 1.55;
          color: var(--fg-2);
          margin: 0 0 18px;
          max-width: 420px;
        }
        .ms-nmw-ai,
        .ms-nmw-icon-btn,
        .ms-nmw-submit,
        .ms-nmw-segment {
          font-family: var(--main-font);
          font-weight: 700;
          cursor: pointer;
        }
        .ms-nmw-ai {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          font-size: 14px;
          padding: 12px 0;
          color: var(--secondary-color);
        }
        .ms-nmw-card {
          background: var(--surface);
          border-radius: 8px;
          padding: 22px;
          box-shadow: var(--shadow-lg);
        }
        .ms-nmw-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .ms-nmw-card-head h3 {
          margin: 0;
          font-family: var(--main-font);
          font-weight: 700;
          font-size: 20px;
          color: var(--fg-1);
        }
        .ms-nmw-icon-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--border-1);
          background: var(--surface-2);
          color: var(--fg-1);
          border-radius: 8px;
          padding: 9px 11px;
          font-size: 12px;
          white-space: nowrap;
        }
        .ms-nmw-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ms-nmw-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .ms-nmw-label {
          display: block;
          font-family: var(--main-font);
          font-weight: 600;
          font-size: 11px;
          color: var(--fg-2);
          text-transform: uppercase;
          letter-spacing: .06em;
          margin-bottom: 4px;
        }
        .ms-nmw-segments,
        .ms-nmw-time-row {
          display: grid;
          gap: 8px;
        }
        .ms-nmw-segments {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .ms-nmw-time-row {
          grid-template-columns: minmax(72px, 1fr) minmax(118px, 1.2fr) minmax(72px, 1fr);
          margin-top: 8px;
        }
        .ms-nmw-segment {
          border: 1px solid var(--border-1);
          background: var(--surface-2);
          color: var(--fg-2);
          border-radius: 8px;
          padding: 11px 8px;
          font-size: 13px;
          min-height: 42px;
        }
        .ms-nmw-segment[data-active="true"] {
          background: var(--secondary-color);
          border-color: var(--secondary-color);
          color: #fff;
        }
        .ms-nmw-hint,
        .ms-nmw-error,
        .ms-nmw-success {
          font-family: var(--main-font);
          font-size: 14px;
          line-height: 1.5;
          margin: 0;
        }
        .ms-nmw-hint { color: var(--fg-2); }
        .ms-nmw-error { color: #b42318; }
        .ms-nmw-success {
          color: var(--fg-2);
          padding: 20px 0;
        }
        .ms-nmw-submit {
          border: none;
          font-size: 14px;
          padding: 13px 0;
          border-radius: 8px;
          background: var(--secondary-color);
          color: #fff;
          width: 100%;
          opacity: 1;
        }
        .ms-nmw-submit:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
        @media (max-width: 880px) {
          .ms-nmw-section { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .ms-nmw-grid,
          .ms-nmw-segments,
          .ms-nmw-time-row {
            grid-template-columns: 1fr;
          }
          .ms-nmw-card-head {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </section>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ms-nmw-segment"
      data-active={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="ms-nmw-label">{label}</span>
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
  borderRadius: 8,
  padding: "13px 14px",
  outline: "2px solid transparent",
  transition: "outline-color 180ms, background 180ms",
  width: "100%",
};
