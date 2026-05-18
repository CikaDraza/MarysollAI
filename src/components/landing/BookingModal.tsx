"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ClipboardDocumentIcon,
  MapPinIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useAIContext } from "@/context/landing/AIContext";
import {
  buildBookingContactPayload,
  getUserInstagram,
  getUserPhone,
  isBookingConflict,
  BOOKING_CONFLICT_MESSAGE,
  mapBookingErrorMessage,
  normalizeBookingPayload,
  validateContactForm,
  validateBookingPayload,
} from "@/lib/booking/bookingPayload";
import type { SearchApiResponse, SearchResult } from "@/types/slots";

function formatPrice(price?: number): string {
  if (!price) return "";
  return new Intl.NumberFormat("sr-Latn").format(price) + " RSD";
}

function buildLocationNote(payload: ReturnType<typeof normalizeBookingPayload>): string | undefined {
  if (!payload?.mapsLink && !payload?.salonAddress) return undefined;
  return [
    "Lokacija salona:",
    payload.salonName,
    payload.salonAddress ? `Adresa: ${payload.salonAddress}, ${payload.city}` : undefined,
    payload.mapsLink ? `Mapa: ${payload.mapsLink}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function showLocationToast(params: {
  salonName: string;
  salonAddress?: string;
  mapsLink?: string;
  shouldShowCopy: boolean;
}) {
  if (!params.mapsLink) return;
  toast(
    (t) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Lokacija salona</strong>
        <span>
          {params.salonName}
          {params.salonAddress ? ` · ${params.salonAddress}` : ""}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href={params.mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => toast.dismiss(t.id)}
            style={{ color: "var(--secondary-color)", fontWeight: 700 }}
          >
            Prikaži mapu
          </a>
          {params.shouldShowCopy && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(params.mapsLink ?? "");
                toast.success("Link lokacije je kopiran.");
                toast.dismiss(t.id);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--secondary-color)",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Kopiraj link do lokacije
            </button>
          )}
        </div>
      </div>
    ),
    { duration: 9000 },
  );
}

export default function BookingModal() {
  const {
    modalSlot: slot,
    recoveryRequest,
    closeModal: onClose,
    clearRecovery,
    openModal,
    persistPendingBooking,
    triggerSuccess,
  } = useBookingModal();
  const { setConfirmed, setConfirmedTime, setDrawerOpen } = useLandingUI();
  const { sendToOrchestrator } = useAIContext();
  const { user, isLoading: authLoading } = useAuthActions();
  const queryClient = useQueryClient();
  const bookingPayload = useMemo(() => normalizeBookingPayload(slot), [slot]);

  const onConfirm = () => {
    onClose();
    setConfirmedTime(bookingPayload?.time ?? "");
    setConfirmed(true);
  };

  const onLoginRequest = () => {
    if (slot) {
      persistPendingBooking(slot);
    }
    onClose();
    setDrawerOpen(true);
    sendToOrchestrator(
      "Želim da se prijavim da bih nastavila zakazivanje ovog termina.",
      {
        intent: "login_for_booking",
        selectedSlot: slot,
        aiBookingState: "auth_required",
      },
    );
  };
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formInstagram, setFormInstagram] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill form when user loads (handles page-refresh case where phone may be missing)
  useEffect(() => {
    setFormName(user?.name ?? "");
    setFormPhone(getUserPhone(user));
    setFormEmail(user?.email ?? "");
    setFormInstagram(getUserInstagram(user));
    setFormError("");
  }, [
    user?.email,
    user?.name,
    user?.phone,
    user?.phoneNumber,
    user?.mobile,
    user?.mobilePhone,
    user?.instagram,
    user?.instagramUsername,
    slot,
  ]);

  useEffect(() => {
    if (!slot) return;
    console.debug("[BOOKING_PREFILL]", {
      selectedSlot: slot,
      authState: {
        isAuthenticated: Boolean(user),
        userName: user?.name,
      },
      restoredBookingState: {
        salonId: slot.salonId,
        salonName: slot.salonName,
        serviceId: slot.serviceId,
        serviceName: slot.serviceName,
        category: slot.category,
        date: bookingPayload?.date,
        time: bookingPayload?.time,
        price: slot.price,
        duration: bookingPayload?.duration,
        city: slot.city,
        clientName: user?.name,
        clientPhone: user?.phone ?? user?.phoneNumber ?? user?.mobile ?? user?.mobilePhone,
        instagram: user?.instagram ?? user?.instagramUsername,
      },
    });
  }, [bookingPayload, slot, user]);

  useEffect(() => {
    if (!recoveryRequest) return;

    let cancelled = false;
    const recover = async () => {
      const normalized = recoveryRequest.normalizedPayload;
      const service =
        normalized?.serviceName || recoveryRequest.originalSlot.serviceName || "";
      const city = normalized?.city || recoveryRequest.originalSlot.city || "";
      const date = normalized?.date;
      const time = normalized?.time;

      if (!service || !city) {
        clearRecovery();
        setDrawerOpen(true);
        sendToOrchestrator(
          "Ne mogu pouzdano da povežem termin sa salonom. Proveravam najbliže dostupne opcije.",
          {
            intent: "booking",
            service,
            city,
            date,
            time,
          },
        );
        return;
      }

      const params = new URLSearchParams();
      params.set("city", city);
      params.set("category", service);
      params.set("service", service);
      if (date) params.set("date", date);
      if (time) params.set("time", time);

      try {
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = (await res.json()) as SearchApiResponse;
        if (cancelled) return;
        const matchingSlots = (data.results ?? []).filter((candidate) => {
          if (time && candidate.timeLabel !== time) return false;
          return true;
        });
        const slots = matchingSlots.length > 0 ? matchingSlots : data.results ?? [];
        const uniqueSalons = Array.from(
          new Map(slots.map((s) => [s.salonId, s])).values(),
        );

        if (uniqueSalons.length === 1) {
          const recovered = uniqueSalons[0] as SearchResult;
          clearRecovery();
          openModal({
            ...recoveryRequest.originalSlot,
            ...recovered,
            startTime: recovered.startTime || normalized?.startTime,
            date: normalized?.date,
            time: recovered.timeLabel || normalized?.time,
          });
          return;
        }

        clearRecovery();
        setDrawerOpen(true);
        if (uniqueSalons.length > 1) {
          sendToOrchestrator("Izaberi salon za ovaj termin.", {
            intent: "recover_missing_salon",
            city,
            service,
            date,
            time,
            salons: uniqueSalons.map((slot) => ({
              id: slot.salonId,
              name: slot.salonName,
            })),
          });
          return;
        }

        sendToOrchestrator(
          "Ne mogu pouzdano da povežem termin sa salonom. Proveravam najbliže dostupne opcije.",
          {
            intent: "booking",
            service,
            city,
            date,
            time,
          },
        );
      } catch {
        if (cancelled) return;
        clearRecovery();
        setDrawerOpen(true);
        sendToOrchestrator(
          "Ne mogu pouzdano da povežem termin sa salonom. Proveravam najbliže dostupne opcije.",
          {
            intent: "booking",
            service,
            city,
            date,
            time,
          },
        );
      }
    };

    toast.loading("Nedostaje salon ili termin. Pokušavam da pronađem odgovarajući salon.", {
      id: "booking-recovery",
    });
    void recover().finally(() => toast.dismiss("booking-recovery"));

    return () => {
      cancelled = true;
    };
  }, [
    clearRecovery,
    openModal,
    recoveryRequest,
    sendToOrchestrator,
    setDrawerOpen,
  ]);

  if (!slot) return null;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const name = formName.trim();
    const phone = formPhone.trim();
    const email = formEmail.trim();
    const instagram = formInstagram.trim();
    setFormError("");

    const contactValidation = validateContactForm({
      isAuthenticated: Boolean(user),
      form: { name, phone, email, instagram },
    });
    if (!contactValidation.ok) {
      const msg =
        contactValidation.message ??
        "Unesite telefon, email ili Instagram da salon može da potvrdi termin.";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    const normalized = normalizeBookingPayload(slot);
    const validation = validateBookingPayload(normalized);
    if (!validation.ok || !normalized) {
      const msg = validation.recoverable
        ? "Nedostaje salon ili termin. Pokušavam da pronađem odgovarajući salon."
        : "Nedostaju podaci za zakazivanje. Pokušajte ponovo.";
      setFormError(msg);
      toast.error(msg);
      onClose();
      if (slot) openModal(slot);
      return;
    }
    setLoading(true);
    try {
      const contactPayload = buildBookingContactPayload({
        user,
        form: { name, phone, email, instagram },
      });
      const locationNote = buildLocationNote(normalized);
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: normalized.salonId,
          salonName: normalized.salonName,
          salonAddress: normalized.salonAddress,
          salonCity: normalized.city,
          salonLat: normalized.salonLat,
          salonLng: normalized.salonLng,
          mapsLink: normalized.mapsLink,
          distanceKm: normalized.distanceKm,
          travelMinutesEstimate: normalized.travelMinutesEstimate,
          metadata: {
            location: {
              salonName: normalized.salonName,
              salonAddress: normalized.salonAddress,
              salonCity: normalized.city,
              salonLat: normalized.salonLat,
              salonLng: normalized.salonLng,
              mapsLink: normalized.mapsLink,
              distanceKm: normalized.distanceKm,
              travelMinutesEstimate: normalized.travelMinutesEstimate,
            },
          },
          serviceId: normalized.serviceId,
          serviceName: normalized.serviceName,
          startTime: normalized.startTime,
          ...contactPayload,
          contactNote: [contactPayload.contactNote, locationNote]
            .filter(Boolean)
            .join("\n\n") || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (isBookingConflict(res.status, data.code ?? data.error)) {
          toast.error(BOOKING_CONFLICT_MESSAGE);
          onClose();
          setDrawerOpen(true);
          sendToOrchestrator(BOOKING_CONFLICT_MESSAGE, {
            intent: "booking_conflict",
            selectedSlot: slot,
            serviceId: slot?.serviceId ?? undefined,
            serviceName: slot?.serviceName ?? undefined,
            salonId: slot?.salonId ?? undefined,
            salonName: slot?.salonName ?? undefined,
            city: slot?.city ?? undefined,
            date: bookingPayload?.date,
            time: bookingPayload?.time,
            startTime: bookingPayload?.startTime,
            duration: bookingPayload?.duration,
            clientContext: {
              name: formName.trim(),
              phone: formPhone.trim() || undefined,
              email: formEmail.trim() || undefined,
              instagram: formInstagram.trim() || undefined,
              isAuthenticated: Boolean(user),
              userName: user?.name,
            },
          });
          return;
        }
        throw new Error(mapBookingErrorMessage(data.error));
      }
      // The slot is gone now; invalidate every cache that could still show
      // it as free. Without this, useSearch/useSlots keep serving the stale
      // slot for up to staleTime (2 min / 30 s) and the user sees ghosts.
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["search"] });
      queryClient.invalidateQueries({ queryKey: ["salons"] });
      toast.success("Termin uspešno zakazan!");
      showLocationToast({
        salonName: normalized.salonName,
        salonAddress: normalized.salonAddress,
        mapsLink: normalized.mapsLink,
        shouldShowCopy: !email,
      });
      triggerSuccess();
      onConfirm();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? mapBookingErrorMessage(err.message)
          : "Greška pri zakazivanju",
      );
    } finally {
      setLoading(false);
    }
  }

  const priceLabel = formatPrice(bookingPayload?.price);
  const locationTitle = bookingPayload?.travelMinutesEstimate
    ? `oko ${bookingPayload.travelMinutesEstimate} min`
    : undefined;
  const headerLabel = bookingPayload
    ? [
        bookingPayload.city,
        bookingPayload.salonName,
        bookingPayload.serviceName,
        bookingPayload.time,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60 }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          zIndex: 80,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            background: "var(--surface)",
            borderRadius: 28,
            boxShadow: "var(--shadow-lg)",
            width: "100%",
            maxWidth: 440,
            padding: 28,
            fontFamily: "var(--main-font)",
          }}
        >
          {/* "Logged in as" banner */}
          {user && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--brand-50)",
                border: "1px solid var(--brand-200, #e9d5ff)",
                borderRadius: 12,
                padding: "9px 14px",
                marginBottom: 18,
              }}
            >
              <CheckCircleIcon
                style={{ width: 16, height: 16, color: "var(--secondary-color)", flexShrink: 0 }}
                strokeWidth={2}
              />
              <span
                style={{
                  fontFamily: "var(--main-font)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--secondary-color)",
                }}
              >
                Zakazuješ kao <strong>{user.name}</strong>
              </span>
            </div>
          )}
          {user && (
            <p
              style={{
                margin: "-10px 0 18px",
                fontFamily: "var(--main-font)",
                fontSize: 12,
                color: "var(--fg-3)",
                lineHeight: 1.45,
              }}
            >
              Kontakt nije obavezan. Salon može da te kontaktira preko naloga ili emaila.
            </p>
          )}

          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 22,
            }}
          >
            <div>
              <h2
                style={{
                  margin: "0 0 3px",
                  fontFamily: "var(--main-font)",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "var(--fg-1)",
                }}
              >
                Potvrda termina
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)" }}>
                {headerLabel}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--fg-3)",
                display: "flex",
                borderRadius: 8,
              }}
            >
              <XMarkIcon style={{ width: 20, height: 20 }} />
            </button>
          </div>

          {/* Price row */}
          {priceLabel && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
                paddingBottom: 18,
                borderBottom: "1px solid var(--border-1)",
              }}
            >
              <span style={{ fontFamily: "var(--main-font)", fontSize: 13, color: "var(--fg-2)", fontWeight: 500 }}>
                Cena usluge
              </span>
              <span style={{ fontFamily: "var(--main-font)", fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>
                {priceLabel}
              </span>
            </div>
          )}

          {(bookingPayload?.mapsLink || bookingPayload?.salonAddress) && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 18,
                paddingBottom: 18,
                borderBottom: "1px solid var(--border-1)",
              }}
            >
              <MapPinIcon
                style={{
                  width: 18,
                  height: 18,
                  color: "var(--secondary-color)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
                strokeWidth={1.8}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: "0 0 4px",
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--fg-1)",
                  }}
                >
                  Lokacija salona
                </p>
                {bookingPayload.salonAddress && (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--main-font)",
                      fontSize: 12,
                      color: "var(--fg-3)",
                      lineHeight: 1.4,
                    }}
                  >
                    Adresa: {bookingPayload.salonAddress}, {bookingPayload.city}
                  </p>
                )}
                {bookingPayload.mapsLink && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <a
                      href={bookingPayload.mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={locationTitle}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontFamily: "var(--main-font)",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--secondary-color)",
                        textDecoration: "none",
                      }}
                    >
                      Prikaži mapu
                    </a>
                    {!formEmail.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(bookingPayload.mapsLink ?? "");
                          toast.success("Link lokacije je kopiran.");
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          fontFamily: "var(--main-font)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--secondary-color)",
                          cursor: "pointer",
                        }}
                      >
                        <ClipboardDocumentIcon style={{ width: 13, height: 13 }} />
                        Kopiraj link do lokacije
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!user && !authLoading && (
              <>
                <OutlineBtn onClick={onLoginRequest} label="Prijavi se" />
                <Divider label="ili nastavi kao gost" />
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    color: "var(--fg-2)",
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  Unesi ime i bar jedan kontakt za potvrdu termina.
                </p>
              </>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ModalField label="Ime i prezime">
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (formError) setFormError("");
                  }}
                  placeholder="Ana Petrović"
                  style={inputStyle}
                />
              </ModalField>
              <ModalField label={user ? "Drugi telefon za ovaj termin (opciono)" : "Telefon"}>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => {
                    setFormPhone(e.target.value);
                    if (formError) setFormError("");
                  }}
                  placeholder="+381 60 123 4567"
                  style={inputStyle}
                />
              </ModalField>
              {!user && (
                <ModalField label="Email">
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      if (formError) setFormError("");
                    }}
                    placeholder="ana@email.com"
                    style={inputStyle}
                  />
                </ModalField>
              )}
              <ModalField label={user ? "Instagram za ovaj termin (opciono)" : "Instagram"}>
                <input
                  type="text"
                  value={formInstagram}
                  onChange={(e) => {
                    setFormInstagram(e.target.value);
                    if (formError) setFormError("");
                  }}
                  placeholder="@ime.prezime"
                  style={inputStyle}
                />
              </ModalField>
              {formError && (
                <div
                  role="alert"
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#991b1b",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.35,
                  }}
                >
                  {formError}
                </div>
              )}
              <SubmitBtn loading={loading} label={user ? "Potvrdi termin" : "Zakaži kao gost"} />
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
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

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "var(--main-font)",
        fontWeight: 700,
        fontSize: 14,
        padding: "14px 0",
        borderRadius: 14,
        background: "var(--secondary-color)",
        color: "#fff",
        width: "100%",
        opacity: loading ? 0.7 : 1,
        transition: "background var(--dur-fast) var(--ease-out), opacity 150ms",
      }}
      onMouseEnter={(e) => {
        if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--secondary-color)";
      }}
    >
      {loading ? "Zakazujem…" : label}
    </button>
  );
}

function OutlineBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "2px solid var(--secondary-color)",
        cursor: "pointer",
        fontFamily: "var(--main-font)",
        fontWeight: 700,
        fontSize: 14,
        padding: "13px 0",
        borderRadius: 14,
        background: "transparent",
        color: "var(--secondary-color)",
        width: "100%",
        transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.background = "var(--secondary-color)";
        b.style.color = "#fff";
      }}
      onMouseLeave={(e) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.background = "transparent";
        b.style.color = "var(--secondary-color)";
      }}
    >
      {label}
    </button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
      <span style={{ fontFamily: "var(--main-font)", fontSize: 12, color: "var(--fg-3)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
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
  borderRadius: 14,
  padding: "13px 14px",
  outline: "2px solid transparent",
  transition: "outline-color 180ms",
  width: "100%",
};
