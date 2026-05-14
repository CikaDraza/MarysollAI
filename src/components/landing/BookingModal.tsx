"use client";

import { useState, useEffect } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useBookingModal } from "@/context/landing/BookingModalContext";
import { useLandingUI } from "@/context/landing/LandingUIContext";
import { useAIContext } from "@/context/landing/AIContext";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
}

function formatPrice(price?: number): string {
  if (!price) return "";
  return new Intl.NumberFormat("sr-Latn").format(price) + " RSD";
}

export default function BookingModal() {
  const { modalSlot: slot, closeModal: onClose, triggerSuccess } = useBookingModal();
  const { setConfirmed, setDrawerOpen } = useLandingUI();
  const { sendMessage } = useAIContext();
  const { user, isLoading: authLoading } = useAuthActions();

  const onConfirm = () => {
    onClose();
    setConfirmed(true);
  };

  const onLoginRequest = () => {
    onClose();
    setDrawerOpen(true);
    sendMessage("Želim da se prijavim da bih nastavila zakazivanje ovog termina.");
  };
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formInstagram, setFormInstagram] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  // Pre-fill form when user loads (handles page-refresh case where phone may be missing)
  useEffect(() => {
    setFormName(user?.name ?? "");
    setFormPhone(user?.phone ?? user?.phoneNumber ?? user?.mobile ?? user?.mobilePhone ?? "");
    setFormInstagram(user?.instagram ?? user?.instagramUsername ?? "");
    setFormError("");
  }, [
    user?.name,
    user?.phone,
    user?.phoneNumber,
    user?.mobile,
    user?.mobilePhone,
    user?.instagram,
    user?.instagramUsername,
    slot,
  ]);

  if (!slot) return null;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const name = formName.trim();
    const phone = formPhone.trim();
    const instagram = formInstagram.trim();
    setFormError("");

    if (!name) {
      setFormError("Unesite ime i prezime.");
      toast.error("Unesite ime i prezime");
      return;
    }
    if (!phone && !instagram) {
      const msg = "Unesite telefon ili Instagram. Jedno od ta dva polja je obavezno.";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: slot!.salonId,
          serviceId: slot!.serviceId ?? undefined,
          serviceName: slot!.serviceName,
          startTime: slot!.startTime,
          user: { name, phone, instagram: instagram || undefined },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Greška");
      }
      toast.success("Termin uspešno zakazan!");
      triggerSuccess();
      onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Greška pri zakazivanju");
    } finally {
      setLoading(false);
    }
  }

  const priceLabel = formatPrice(slot.price);

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
                {slot.salonName}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)" }}>
                {slot.city && `${slot.city} · `}
                {slot.serviceName} · {formatTime(slot.startTime)}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!user && !authLoading && (
              <>
                <OutlineBtn onClick={onLoginRequest} label="Prijavi se" />
                <Divider label="ili nastavi kao gost" />
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
              <ModalField label="Telefon">
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
              <ModalField label="Instagram (alternativa za telefon)">
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
