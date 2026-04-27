"use client";

import { useState, useEffect } from "react";
import { XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuthActions } from "@/hooks/useAuthActions";
import type { FlatSlot } from "@/types/slots";

interface Props {
  slot: FlatSlot | null;
  onClose: () => void;
  onConfirm: () => void;
  onLoginRequest: () => void;
}

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

export default function BookingModal({ slot, onClose, onConfirm, onLoginRequest }: Props) {
  const { user } = useAuthActions();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  if (!slot) return null;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Unesite ime i telefon");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId: slot!.salonId,
          serviceId: slot!.serviceId ?? "",
          startTime: slot!.startTime,
          user: { name, phone },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Greška");
      }
      toast.success("Termin uspešno zakazan!");
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
          zIndex: 61,
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

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModalField label="Ime i prezime">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ana Petrović"
                required
                style={inputStyle}
              />
            </ModalField>

            <ModalField label="Telefon">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+381 60 123 4567"
                required
                style={inputStyle}
              />
            </ModalField>

            {/* Price */}
            {priceLabel && (
              <div
                style={{
                  borderTop: "1px solid var(--border-1)",
                  paddingTop: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    color: "var(--fg-2)",
                    fontWeight: 500,
                  }}
                >
                  Cena usluge
                </span>
                <span
                  style={{
                    fontFamily: "var(--main-font)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--fg-1)",
                  }}
                >
                  {priceLabel}
                </span>
              </div>
            )}

            {/* Login nudge (only if not logged in) */}
            {!user && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={onLoginRequest}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--main-font)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--secondary-color)",
                    padding: "2px 4px",
                    borderRadius: 6,
                    transition: "opacity 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = "0.7";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                  }}
                >
                  Već imate nalog? Prijavi se
                </button>
              </div>
            )}

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
                marginTop: 4,
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
              {loading ? "Zakazujem…" : "Zakaži termin"}
            </button>
          </form>
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
