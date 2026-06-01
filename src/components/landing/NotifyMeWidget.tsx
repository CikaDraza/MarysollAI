"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellAlertIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useCityContext } from "@/context/landing/CityContext";
import { useFilters } from "@/context/landing/FiltersContext";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { useAuthActions } from "@/hooks/useAuthActions";
import {
  clearStoredWatchId,
  deriveWatchViewState,
  isMatchedSlotComplete,
  readStoredWatchId,
  shouldPollWatch,
  storeWatchId,
  type WatchApiStatus,
  type WatchViewState,
} from "@/lib/availability/notifyWatchLifecycle";
import {
  isBrowserPushSupported,
  subscribeToBrowserPush,
} from "@/lib/notifications/browserPush";
import { handleRecoveryEvent } from "@/lib/ai/recovery/recovery-engine";
import {
  filterSalonsForAutocomplete,
  type SalonOption,
} from "@/lib/availability/salonAutocomplete";
import type { BookingModalSlot } from "@/lib/booking/bookingPayload";
import type { SearchResult } from "@/types/slots";

const POLL_INTERVAL_MS = 25_000;

type WatchStatusResponse = {
  status?: WatchApiStatus;
  matchedSlot?: Partial<SearchResult> | null;
};

function getWatchStorage(): Storage | null {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

type PreferredTimeMode = "anytime" | "today" | "tomorrow";
type TimeRelation = "before" | "after";
function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function hourFromTime(value: string): number | undefined {
  const hour = Number(value.slice(0, 2));
  return Number.isFinite(hour) ? hour : undefined;
}


export default function NotifyMeWidget() {
  const { setDrawerOpen } = useLandingUI();
  const { cityName } = useCityContext();
  const { category } = useFilters();
  const { openModal } = useBookingModal();
  const { user } = useAuthActions();
  const onOpenAI = () => setDrawerOpen(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [service, setService] = useState(category ?? "");
  const [city, setCity] = useState(cityName ?? "");
  const [salonQuery, setSalonQuery] = useState("");
  const [selectedSalon, setSelectedSalon] = useState<{
    id: string;
    name: string;
    city: string;
  } | null>(null);
  const [allSalons, setAllSalons] = useState<SalonOption[]>([]);
  const [preferredTimeMode, setPreferredTimeMode] =
    useState<PreferredTimeMode>("anytime");
  const [timeRelation, setTimeRelation] = useState<TimeRelation>("after");
  const [selectedTime, setSelectedTime] = useState("15:00");
  const [pushSubscription, setPushSubscription] =
    useState<{ endpoint: string; keys: { p256dh: string; auth: string } } | null>(null);
  const [pushStatus, setPushStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [watchId, setWatchId] = useState<string | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchApiStatus | null>(null);
  const [matchedSlot, setMatchedSlot] = useState<Partial<SearchResult> | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<SearchResult[] | null>(null);
  const [slotConflictMsg, setSlotConflictMsg] = useState("");
  const restoredRef = useRef(false);

  const watchView: WatchViewState = deriveWatchViewState(watchStatus);
  const matchedComplete = useMemo(
    () => isMatchedSlotComplete(matchedSlot as BookingModalSlot | null),
    [matchedSlot],
  );

  const fetchWatchStatus = useCallback(
    async (
      id: string,
      signal?: AbortSignal,
    ): Promise<WatchStatusResponse | { notFound: true }> => {
      const res = await fetch(`/api/waitlist?id=${encodeURIComponent(id)}`, {
        signal,
      });
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error("watch_status_failed");
      return (await res.json()) as WatchStatusResponse;
    },
    [],
  );

  const applyWatchData = useCallback((id: string, data: WatchStatusResponse) => {
    const status = (data.status ?? "active") as WatchApiStatus;
    setWatchId(id);
    setWatchStatus(status);
    if (data.matchedSlot) setMatchedSlot(data.matchedSlot);
    const view = deriveWatchViewState(status);
    if (view === "expired" || view === "cancelled") {
      clearStoredWatchId(getWatchStorage());
    }
  }, []);

  const resetWatch = useCallback(() => {
    clearStoredWatchId(getWatchStorage());
    setWatchId(null);
    setWatchStatus(null);
    setMatchedSlot(null);
    setAlternatives(null);
    setSlotConflictMsg("");
    setError("");
  }, []);

  type ResumeResponse =
    | { status: "available"; slot: SearchResult; bookingPayload: SearchResult }
    | { status: "alternative_found"; alternatives: SearchResult[] }
    | { status: "no_longer_available" }
    | { status: "cancelled" | "expired" | "failed" };

  const handleResumeAndView = useCallback(() => {
    if (!watchId) return;
    setResumeLoading(true);
    setSlotConflictMsg("");
    setAlternatives(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/waitlist/resume?id=${encodeURIComponent(watchId)}`,
        );
        const data = (await res.json().catch(() => ({}))) as ResumeResponse & {
          status?: string;
        };

        if (data.status === "available" && "bookingPayload" in data) {
          openModal(data.bookingPayload as BookingModalSlot);
          return;
        }

        if (data.status === "alternative_found" && "alternatives" in data) {
          setAlternatives(data.alternatives);
          setSlotConflictMsg(
            "Taj termin je u međuvremenu zauzet, ali pronašli smo druge opcije.",
          );
          handleRecoveryEvent({
            type: "recovery",
            reason: "slot_taken",
            severity: "recoverable",
            source: "BookingModal",
            payload: { watchId },
            notifyAgent: false,
            visibleInThread: false,
            timestamp: Date.now(),
          });
          return;
        }

        if (data.status === "no_longer_available") {
          setWatchStatus("active");
          setMatchedSlot(null);
          setSlotConflictMsg(
            "Termin je u međuvremenu zauzet. Nastavljamo da pratimo vaš zahtev.",
          );
          handleRecoveryEvent({
            type: "recovery",
            reason: "slot_taken",
            severity: "recoverable",
            source: "BookingModal",
            payload: { watchId },
            notifyAgent: false,
            visibleInThread: false,
            timestamp: Date.now(),
          });
          return;
        }

        // Terminal: cancelled / expired / failed → reflect in widget state.
        if (data.status === "cancelled") setWatchStatus("cancelled");
        else if (data.status === "expired") setWatchStatus("expired");
        else if (data.status === "failed") setWatchStatus("failed");
      } catch {
        setSlotConflictMsg(
          "Provera dostupnosti nije uspela. Pokušajte ponovo.",
        );
      } finally {
        setResumeLoading(false);
      }
    })();
  }, [watchId, openModal]);

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
    setInstagram(
      (current) => current || user.instagram || user.instagramUsername || "",
    );
  }, [user]);

  // Fetch salon list once on mount for autocomplete — soft-fail.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/salons")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) {
          setAllSalons(
            (data as Array<Record<string, unknown>>).map((s) => ({
              id: (s.id ?? s._id ?? "") as string,
              name: (s.name ?? "") as string,
              city: (s.city ?? "") as string,
              services: Array.isArray(s.services)
                ? (s.services as Array<{ name: string; category: string }>)
                : [],
            })),
          );
        }
      })
      .catch(() => {/* non-fatal — form works without suggestions */});
    return () => { cancelled = true; };
  }, []);

  // Clear selected salon when city changes to an incompatible value.
  useEffect(() => {
    if (selectedSalon && city && selectedSalon.city !== city) {
      setSelectedSalon(null);
      setSalonQuery("");
    }
  }, [city, selectedSalon]);

  const isLoggedIn = Boolean(user?.id);
  const contactHint = useMemo(() => {
    if (isLoggedIn) return "Kontakt je opcioni override za postojeći nalog.";
    return "Za goste je potrebno ime i bar jedan kontakt.";
  }, [isLoggedIn]);

  // Restore a previously submitted watch on mount and refresh its status.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = readStoredWatchId(getWatchStorage());
    if (!stored) return;

    const controller = new AbortController();
    (async () => {
      try {
        const data = await fetchWatchStatus(stored, controller.signal);
        if (controller.signal.aborted) return;
        if ("notFound" in data) {
          clearStoredWatchId(getWatchStorage());
          return;
        }
        applyWatchData(stored, data);
      } catch {
        if (controller.signal.aborted) return;
        setWatchId(stored);
        setWatchStatus("failed");
      }
    })();
    return () => controller.abort();
  }, [applyWatchData, fetchWatchStatus]);

  // Poll the watch status while it is still active. Stops on terminal status
  // and aborts in-flight requests on unmount to avoid stale state updates.
  useEffect(() => {
    if (!watchId || !shouldPollWatch(watchStatus)) return;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const data = await fetchWatchStatus(watchId, controller.signal);
        if (controller.signal.aborted) return;
        if ("notFound" in data) {
          clearStoredWatchId(getWatchStorage());
          setWatchId(null);
          setWatchStatus(null);
          return;
        }
        applyWatchData(watchId, data);
      } catch {
        // Transient failure: keep the active watch and retry on next tick.
      }
    };
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [watchId, watchStatus, applyWatchData, fetchWatchStatus]);

  const handleCancel = useCallback(() => {
    if (!watchId) return;
    setCancelError("");
    setCancelLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/waitlist?id=${encodeURIComponent(watchId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "Otkazivanje nije uspelo.");
        }
        clearStoredWatchId(getWatchStorage());
        setWatchId(null);
        setWatchStatus("cancelled");
      } catch (err) {
        setCancelError(
          err instanceof Error
            ? err.message
            : "Nismo uspeli da otkažemo zahtev. Pokušajte ponovo.",
        );
      } finally {
        setCancelLoading(false);
      }
    })();
  }, [watchId]);

  const handleRetry = useCallback(() => {
    if (!watchId) return;
    setWatchStatus("active");
    (async () => {
      try {
        const data = await fetchWatchStatus(watchId);
        if ("notFound" in data) {
          clearStoredWatchId(getWatchStorage());
          setWatchId(null);
          setWatchStatus(null);
          return;
        }
        applyWatchData(watchId, data);
      } catch {
        setWatchStatus("failed");
      }
    })();
  }, [watchId, applyWatchData, fetchWatchStatus]);

  async function handleRequestPush() {
    if (!isBrowserPushSupported()) {
      setPushStatus("denied");
      return;
    }
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setPushStatus("denied");
      return;
    }
    const sub = await subscribeToBrowserPush(vapidPublicKey);
    if (sub) {
      setPushSubscription(sub);
      setPushStatus("granted");
    } else {
      setPushStatus("denied");
    }
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedInstagram = instagram.trim();
    const trimmedTiktok = tiktok.trim();
    const hasAnyContact = Boolean(
      trimmedEmail || trimmedPhone || trimmedInstagram || trimmedTiktok,
    );

    if (!service.trim() || !city.trim()) {
      setError("Usluga i grad su obavezni.");
      return;
    }
    if (!isLoggedIn && (!trimmedName || !hasAnyContact)) {
      setError(
        "Unesite ime i bar jedan kontakt: email, telefon, Instagram ili TikTok.",
      );
      return;
    }

    const cutoffHour =
      preferredTimeMode === "anytime" ? undefined : hourFromTime(selectedTime);
    const preferredDate =
      preferredTimeMode === "today"
        ? todayIso()
        : preferredTimeMode === "tomorrow"
          ? todayIso(1)
          : undefined;
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("assistant_token")
        : null;

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
          salonId: selectedSalon?.id || undefined,
          salonName: selectedSalon?.name || undefined,
          preferredTimeMode,
          preferredDate,
          timeWindowStart:
            cutoffHour != null && timeRelation === "after"
              ? cutoffHour
              : undefined,
          timeWindowEnd:
            cutoffHour != null && timeRelation === "before"
              ? cutoffHour
              : undefined,
          instagram: trimmedInstagram || undefined,
          tiktok: trimmedTiktok || undefined,
          pushAllowed: Boolean(pushSubscription),
          pushSubscription: pushSubscription ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Slanje trenutno nije uspelo.");
      }
      const created = (await res.json().catch(() => ({}))) as {
        id?: string;
        status?: WatchApiStatus;
      };
      if (created.id) {
        storeWatchId(getWatchStorage(), created.id);
        setWatchId(created.id);
        setWatchStatus(created.status ?? "active");
      }
      if (pushStatus === "granted") {
        // Push subscription is active — user will be notified via SW when a
        // slot is found. No direct Notification() call needed here.
      } else if (pushStatus === "denied") {
        // Push was declined — watch is still saved, email/in-app will notify.
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Slanje trenutno nije uspelo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="notify-me"
      style={{ marginTop: 56 }}
      className="ms-nmw-section pt-28"
    >
      <div style={{ paddingTop: 12 }}>
        <p className="ms-nmw-eyebrow">Nema termina?</p>
        <h2 className="ms-nmw-title">
          Nema slobodnih termina za ovu uslugu.
          <br />
          <span>Možemo da te obavestimo</span> čim se pojavi prvi slobodan
          termin.
        </h2>
        <p className="ms-nmw-copy">
          Ostavi uslugu, grad i željeni vremenski okvir. Ne rezervišemo
          automatski; šaljemo link da potvrdiš termin kada se pojavi.
        </p>
        <button type="button" onClick={onOpenAI} className="ms-nmw-ai">
          <SparklesIcon style={{ width: 16, height: 16 }} strokeWidth={1.5} />
          Pitaj asistenta
        </button>
      </div>

      <div className="ms-nmw-card">
        <div className="ms-nmw-card-head">
          <h3>Obavesti me</h3>
          <button
            type="button"
            onClick={handleRequestPush}
            className="ms-nmw-icon-btn"
            disabled={pushStatus === "granted"}
          >
            <BellAlertIcon
              style={{ width: 18, height: 18 }}
              strokeWidth={1.7}
            />
            <span>
              {pushStatus === "granted"
                ? "Obaveštenja uključena"
                : pushStatus === "denied"
                  ? "Push odbijen"
                  : "Browser push"}
            </span>
          </button>
        </div>

        {watchView !== "idle" ? (
          <WatchStatusPanel
            view={watchView}
            service={service}
            city={city}
            matchedComplete={matchedComplete}
            hasMatchedSlot={Boolean(matchedSlot)}
            onViewSlot={handleResumeAndView}
            resumeLoading={resumeLoading}
            alternatives={alternatives}
            slotConflictMsg={slotConflictMsg}
            onSelectAlternative={(s: SearchResult) => openModal(s as BookingModalSlot)}
            onReset={resetWatch}
            onRetry={handleRetry}
            onCancel={handleCancel}
            cancelLoading={cancelLoading}
            cancelError={cancelError}
          />
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

            <SalonAutocompleteField
              query={salonQuery}
              selected={selectedSalon}
              salons={allSalons}
              city={city}
              service={service}
              onQueryChange={setSalonQuery}
              onSelect={(s: SelectedSalon) => {
                setSelectedSalon(s);
                setSalonQuery(s.name);
                if (city === "") setCity(s.city);
              }}
              onClear={() => {
                setSelectedSalon(null);
                setSalonQuery("");
              }}
            />

            <div>
              <span className="ms-nmw-label">Preferirano vreme</span>
              <div className="ms-nmw-segments">
                <SegmentButton
                  active={preferredTimeMode === "anytime"}
                  onClick={() => setPreferredTimeMode("anytime")}
                >
                  Bilo kada
                </SegmentButton>
                <SegmentButton
                  active={preferredTimeMode === "today"}
                  onClick={() => setPreferredTimeMode("today")}
                >
                  Danas
                </SegmentButton>
                <SegmentButton
                  active={preferredTimeMode === "tomorrow"}
                  onClick={() => setPreferredTimeMode("tomorrow")}
                >
                  Sutra
                </SegmentButton>
              </div>
              {preferredTimeMode !== "anytime" && (
                <div className="ms-nmw-time-row">
                  <SegmentButton
                    active={timeRelation === "before"}
                    onClick={() => setTimeRelation("before")}
                  >
                    Pre
                  </SegmentButton>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    style={inputStyle}
                  />
                  <SegmentButton
                    active={timeRelation === "after"}
                    onClick={() => setTimeRelation("after")}
                  >
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
        .ms-nmw-watch {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ms-nmw-watch .ms-nmw-success {
          padding: 12px 0 0;
        }
        .ms-nmw-alt-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ms-nmw-alt-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          width: 100%;
          background: var(--surface-2);
          border: 1px solid var(--border-1);
          border-radius: 8px;
          padding: 10px 14px;
          cursor: pointer;
          font-family: var(--main-font);
          font-size: 13px;
          text-align: left;
        }
        .ms-nmw-alt-item:hover { background: var(--surface); }
        .ms-nmw-alt-name { font-weight: 600; color: var(--fg-1); }
        .ms-nmw-alt-time { color: var(--fg-2); font-size: 12px; white-space: nowrap; }
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
        .ms-nmw-ac-wrap { position: relative; }
        .ms-nmw-ac-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--surface-2);
          border-radius: 8px;
          padding: 11px 14px;
          font-family: var(--main-font);
          font-size: 14px;
          font-weight: 500;
          color: var(--fg-1);
        }
        .ms-nmw-ac-chip-x {
          margin-left: auto;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--fg-3);
          padding: 0 2px;
          font-size: 16px;
          line-height: 1;
        }
        .ms-nmw-ac-hint {
          font-family: var(--main-font);
          font-size: 12px;
          color: var(--fg-3);
          margin-top: 4px;
        }
        .ms-nmw-ac-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 50;
          background: var(--surface);
          border: 1px solid var(--border-1);
          border-radius: 8px;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
        }
        .ms-nmw-ac-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: var(--main-font);
          font-size: 14px;
          color: var(--fg-1);
        }
        .ms-nmw-ac-item:hover,
        .ms-nmw-ac-item:focus {
          background: var(--surface-2);
          outline: none;
        }
        .ms-nmw-ac-city {
          font-size: 12px;
          color: var(--fg-3);
          margin-left: 6px;
        }
        .ms-nmw-cancel {
          font-family: var(--main-font);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          border: 1px solid var(--border-1);
          background: transparent;
          color: var(--fg-2);
          border-radius: 8px;
          padding: 10px 0;
          width: 100%;
        }
        .ms-nmw-cancel:disabled {
          cursor: not-allowed;
          opacity: 0.6;
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

function WatchStatusPanel({
  view,
  service,
  city,
  matchedComplete,
  hasMatchedSlot,
  onViewSlot,
  resumeLoading,
  alternatives,
  slotConflictMsg,
  onSelectAlternative,
  onReset,
  onRetry,
  onCancel,
  cancelLoading,
  cancelError,
}: {
  view: WatchViewState;
  service: string;
  city: string;
  matchedComplete: boolean;
  hasMatchedSlot: boolean;
  onViewSlot: () => void;
  resumeLoading: boolean;
  alternatives: SearchResult[] | null;
  slotConflictMsg: string;
  onSelectAlternative: (s: SearchResult) => void;
  onReset: () => void;
  onRetry: () => void;
  onCancel: () => void;
  cancelLoading: boolean;
  cancelError: string;
}) {
  if (view === "matched") {
    const canOpen = hasMatchedSlot && matchedComplete;

    // After resume: slot taken, alternatives available.
    if (alternatives && alternatives.length > 0) {
      return (
        <div className="ms-nmw-watch">
          {slotConflictMsg && <p className="ms-nmw-error">{slotConflictMsg}</p>}
          <div className="ms-nmw-alt-list">
            {alternatives.map((s) => (
              <button
                key={`${s.salonId}-${s.startTime}`}
                type="button"
                className="ms-nmw-alt-item"
                onClick={() => onSelectAlternative(s)}
              >
                <span className="ms-nmw-alt-name">{s.salonName}</span>
                <span className="ms-nmw-alt-time">{s.dateLabel} · {s.timeLabel}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // After resume: slot taken, no alternatives.
    if (slotConflictMsg && !alternatives) {
      return (
        <div className="ms-nmw-watch">
          <p className="ms-nmw-success">{slotConflictMsg}</p>
        </div>
      );
    }

    // Normal matched state — resume not yet triggered.
    return (
      <div className="ms-nmw-watch">
        <p className="ms-nmw-success">
          {canOpen
            ? "Pronašli smo termin koji odgovara vašem zahtevu."
            : "Termin je pronađen, ali treba još jednom da proverimo dostupnost."}
        </p>
        <button
          type="button"
          onClick={onViewSlot}
          className="ms-nmw-submit"
          disabled={!hasMatchedSlot || resumeLoading}
        >
          {resumeLoading ? "Proveravam…" : canOpen ? "Pogledaj termin" : "Proveri termin"}
        </button>
      </div>
    );
  }

  if (view === "expired") {
    return (
      <div className="ms-nmw-watch">
        <p className="ms-nmw-success">Zahtev je istekao.</p>
        <button type="button" onClick={onReset} className="ms-nmw-submit">
          Pošalji novi zahtev
        </button>
      </div>
    );
  }

  if (view === "cancelled") {
    return (
      <div className="ms-nmw-watch">
        <p className="ms-nmw-success">Zahtev je otkazan.</p>
        <button type="button" onClick={onReset} className="ms-nmw-submit">
          Pošalji novi zahtev
        </button>
      </div>
    );
  }

  if (view === "failed") {
    return (
      <div className="ms-nmw-watch">
        <p className="ms-nmw-error">
          Nismo uspeli da proverimo status. Pokušajte ponovo.
        </p>
        <button type="button" onClick={onRetry} className="ms-nmw-submit">
          Pokušaj ponovo
        </button>
      </div>
    );
  }

  // active
  return (
    <div className="ms-nmw-watch">
      <p className="ms-nmw-success">
        Pratimo termine za vas
        {service ? ` za ${service}` : ""}
        {city ? ` u ${city}` : ""}.
        <br />
        Javićemo čim se pojavi slobodan termin.
      </p>
      {cancelError && <p className="ms-nmw-error">{cancelError}</p>}
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelLoading}
        className="ms-nmw-cancel"
      >
        {cancelLoading ? "Otkazujem…" : "Otkaži praćenje"}
      </button>
    </div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="ms-nmw-label">{label}</span>
      {children}
    </label>
  );
}

type SelectedSalon = { id: string; name: string; city: string };

function SalonAutocompleteField({
  query,
  selected,
  salons,
  city,
  service,
  onQueryChange,
  onSelect,
  onClear,
}: {
  query: string;
  selected: SelectedSalon | null;
  salons: SalonOption[];
  city: string;
  service: string;
  onQueryChange: (v: string) => void;
  onSelect: (s: SelectedSalon) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () =>
      filterSalonsForAutocomplete(salons, query, {
        city: city || undefined,
        service: service || undefined,
      }),
    [salons, query, city, service],
  );

  // Close dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (selected) {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="ms-nmw-label">Salon (opciono)</span>
        <div className="ms-nmw-ac-chip">
          <span>
            {selected.name}
            {selected.city && (
              <span className="ms-nmw-ac-city">· {selected.city}</span>
            )}
          </span>
          <button
            type="button"
            className="ms-nmw-ac-chip-x"
            aria-label="Ukloni odabrani salon"
            onClick={onClear}
          >
            ×
          </button>
        </div>
      </label>
    );
  }

  return (
    <div className="ms-nmw-ac-wrap" ref={wrapRef}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="ms-nmw-label">Salon (opciono)</span>
        <input
          type="text"
          placeholder="Počni da kucaš naziv salona…"
          value={query}
          autoComplete="off"
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { if (query) setOpen(true); }}
          style={inputStyle}
        />
      </label>
      {open && suggestions.length > 0 && (
        <div className="ms-nmw-ac-dropdown" role="listbox">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={false}
              className="ms-nmw-ac-item"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input until selection
                onSelect({ id: s.id, name: s.name, city: s.city ?? "" });
                setOpen(false);
              }}
            >
              {s.name}
              {s.city && <span className="ms-nmw-ac-city">· {s.city}</span>}
            </button>
          ))}
        </div>
      )}
      {!open && (
        <p className="ms-nmw-ac-hint">
          Ako ne izaberete salon, pratićemo sve salone za tu uslugu i grad.
        </p>
      )}
    </div>
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
