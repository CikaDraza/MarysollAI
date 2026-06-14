// src/components/blocks/AppointmentCalendarBlockView.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { AppointmentCalendarBlockType } from "@/types/landing-block";
import { useServices } from "@/hooks/useServices";
import { formatPriceToString } from "@/helpers/formatPrice";
import { useAuthActions } from "@/hooks/useAuthActions";
import { generateTimes } from "@/helpers/generateTimes";
import { useAIAppointment } from "@/hooks/useAIAppointment";
import { Toaster } from "react-hot-toast";
import { useSalons } from "@/hooks/useSalons";
import { getDay } from "date-fns";
import LoaderButton from "../LoaderButton";
import MiniLoader from "../MiniLoader";
import { formatDatePretty } from "@/helpers/formatISODate";
import { Reveal } from "../motion/Reveal";
import { sendSystemAction } from "@/lib/ai/events/systemActionDispatcher";
import {
  markBlockConsumed,
  useBlockLifecycle,
} from "@/lib/ai/layout/block-lifecycle";

interface Props {
  block: AppointmentCalendarBlockType;
  onActionComplete?: (m: string) => void;
}

export default function AppointmentCalendarBlockView({
  block,
  onActionComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lifecycle = useBlockLifecycle(block.id);
  const consumed = lifecycle?.state === "consumed";
  const hasPlatformMetadata = Boolean(block.metadata.salonId);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[APPOINTMENT_BLOCK_INPUT]", {
      metadataKeys: Object.keys(block.metadata ?? {}),
      salonId: block.metadata.salonId,
      salonName: block.metadata.salonName,
      serviceId: block.metadata.serviceId,
      serviceName: block.metadata.serviceName,
      city: block.metadata.city,
      date: block.metadata.date,
      timeWindowStart: block.metadata.timeWindowStart,
      timeWindowEnd: block.metadata.timeWindowEnd,
    });
  }
  const { user } = useAuthActions();
  // Multi-tenant: load the SELECTED salon's services + profile (working hours)
  // by salonId. Previously this used a non-scoped profile and an empty-query
  // service fetch (always []), so the calendar bailed to the dead-end summary.
  const { data: services = [], isLoading } = useServices({
    salonId: block.metadata.salonId,
  });
  const { data: salons = [] } = useSalons();
  const profile = salons.find((s) => s.id === block.metadata.salonId);
  const timeOptions = useMemo(() => generateTimes(8, 20, 30), []);

  const { displayValues, setters, handleAIConfirm, isPending } =
    useAIAppointment({
      block,
      services,
      user,
      onSuccess: (msg) => onActionComplete?.(msg),
    });

  const {
    selectedService,
    activeVariant,
    selectedDate,
    selectedTime,
    isAiSuggested,
    clientName,
    clientPhone,
  } = displayValues;

  const isRescheduleMode = Boolean(block.metadata.rescheduleMode);
  const currentAppointment = block.metadata.currentAppointment;
  const currentAppointmentId = block.metadata.currentAppointmentId;

  function handleRescheduleConfirm() {
    if (!selectedTime || !selectedDate || !currentAppointmentId || !currentAppointment) return;
    const dateStr = typeof selectedDate === "string"
      ? selectedDate
      : (selectedDate as Date).toISOString().slice(0, 10);
    markBlockConsumed(block.id, "reschedule_slot_selected", undefined, block.type);
    sendSystemAction({
      action: "APPOINTMENT_UPDATE_SLOT_SELECTED",
      source: "CalendarBlock",
      payload: {
        appointmentId: currentAppointmentId,
        currentAppointment,
        newDate: dateStr,
        newTime: selectedTime,
        salonId: block.metadata.salonId,
        serviceId: block.metadata.serviceId ?? selectedService?.["_id"],
        salonName: block.metadata.salonName,
        serviceName: block.metadata.serviceName ?? selectedService?.name,
      },
      notifyAgent: false,
      visibleInThread: false,
    });
  }

  function handleConfirm() {
    if (isRescheduleMode) {
      handleRescheduleConfirm();
    } else {
      void handleAIConfirm();
    }
  }

  const workingHoursForDay = useMemo(() => {
    const dayNames = [
      "Nedelja",
      "Ponedeljak",
      "Utorak",
      "Sreda",
      "Četvrtak",
      "Petak",
      "Subota",
    ];

    const hoursSource = profile?.workingHours;

    if (!hoursSource) {
      return { isWorking: false, start: null, end: null };
    }

    const dayName = dayNames[getDay(selectedDate)];
    const timeRange = hoursSource[dayName];

    if (!timeRange) {
      return { dayName, isWorking: false, start: null, end: null };
    }

    // Accept both "08:00 - 20:00" and "08:00-20:00" formats.
    const parts = timeRange.split(/\s*-\s*/);
    if (parts.length === 2 && parts[0]?.trim() && parts[1]?.trim()) {
      return {
        dayName,
        timeRange,
        isWorking: true,
        start: parts[0].trim(),
        end: parts[1].trim(),
      };
    }

    return { isWorking: false, start: null, end: null };
  }, [selectedDate, profile]);

  function isTimeBetween(slot: string, start: string, end: string) {
    const toMins = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    return toMins(slot) >= toMins(start) && toMins(slot) < toMins(end);
  }

  const triggerGlobalScroll = () => {
    const mainContent = document.getElementById("main-content");
    if (mainContent && containerRef.current) {
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  useEffect(() => {
    if (!isLoading && services.length > 0) {
      const timer = setTimeout(triggerGlobalScroll, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, services.length]);

  const missingFields = [
    !block.metadata.salonId ? "salonId" : "",
    !(
      block.metadata.serviceId ||
      block.metadata.serviceName ||
      block.metadata.service
    )
      ? "service"
      : "",
    !block.metadata.city ? "city" : "",
  ].filter(Boolean);

  if (missingFields.length > 0) {
    return (
      <AppointmentMetadataFallback
        block={block}
        missingFields={missingFields}
      />
    );
  }

  if (isLoading)
    return (
      <div className="py-20 text-center">
        <MiniLoader text="Učitavanje termina" />
      </div>
    );

  if (services?.length === 0 && hasPlatformMetadata) {
    return <PlatformAppointmentSummary block={block} />;
  }

  if (services?.length === 0) {
    return (
      <AppointmentMetadataFallback block={block} missingFields={["services"]} />
    );
  }

  const locationLabel = [profile?.city, profile?.name]
    .filter(Boolean)
    .join(" · ");

  // Confirm mode: AI has all data (service + date + time) — show summary + single button
  if (displayValues.selectedTime && displayValues.selectedService) {
    return (
      <Reveal>
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: 20,
            padding: "20px 20px 18px",
            maxWidth: 400,
            maxHeight: "90vh",
            margin: "0 auto",
            overflowY: "auto",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--fg-3)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              margin: "0 0 14px",
            }}
          >
            Potvrda termina
          </h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 18,
            }}
          >
            <Row label="Usluga" value={displayValues.selectedService.name} />
            <Row
              label="Datum"
              value={formatDatePretty(displayValues.selectedDate)}
            />
            <Row label="Vreme" value={displayValues.selectedTime} />
            {locationLabel && <Row label="Salon" value={locationLabel} />}
          </div>
          {!isRescheduleMode && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <input
                type="text"
                placeholder="Ime i prezime"
                value={displayValues.clientName}
                onChange={(e) => setters.setClientName(e.target.value)}
                style={inputStyle}
              />
              <input
                type="tel"
                placeholder="Telefon"
                value={displayValues.clientPhone}
                onChange={(e) => setters.setClientPhone(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          <button
            onClick={() => {
              if (!isRescheduleMode) markBlockConsumed(block.id, "booking_confirm", undefined, block.type);
              handleConfirm();
            }}
            disabled={isPending || consumed}
            style={{
              width: "100%",
              border: "none",
              cursor: isPending || consumed ? "not-allowed" : "pointer",
              fontFamily: "var(--main-font)",
              fontWeight: 700,
              fontSize: 14,
              padding: "13px 0",
              borderRadius: 14,
              background:
                isPending || consumed
                  ? "var(--fg-3)"
                  : "var(--secondary-color)",
              color: "#fff",
              transition: "background 150ms",
              opacity: isPending || consumed ? 0.6 : 1,
            }}
          >
            {consumed
              ? "Izabrano"
              : isPending
                ? "Proveravam…"
                : isRescheduleMode ? "Izaberi termin" : "Potvrdi termin"}
          </button>
          {consumed && <p style={consumedNoteStyle}>Izabrano</p>}
        </div>
      </Reveal>
    );
  }

  return (
    <div ref={containerRef} className="scroll-mt-20">
      <Reveal>
        <div className="bg-white rounded-3xl p-6 shadow-xl max-w-md mx-auto my-6">
          <Toaster position="top-center" />

          {/* Reschedule mode banner */}
          {isRescheduleMode && currentAppointment && (
            <div className="mb-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-0.5">Izmena termina</p>
              <p className="text-xs text-blue-700">
                Trenutno: {currentAppointment.serviceName}
                {currentAppointment.date && currentAppointment.time
                  ? ` · ${currentAppointment.date} u ${currentAppointment.time}`
                  : ""}
              </p>
            </div>
          )}

          {/* Header */}
          <div className="flex justify-between items-center mb-5">
            <h3
              style={{
                fontFamily: "var(--main-font)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--fg-1, #111114)",
                margin: 0,
              }}
            >
              {isRescheduleMode ? "Izaberi novi termin" : "Zakaži termin"}
            </h3>
            {locationLabel && (
              <span
                style={{
                  fontFamily: "var(--main-font)",
                  fontWeight: 500,
                  fontSize: 11,
                  color: "var(--fg-3, #9a8f9a)",
                }}
              >
                {locationLabel}
              </span>
            )}
          </div>

          {/* AI Suggestion Alert */}
          {isAiSuggested && (
            <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100 flex justify-between items-center">
              <p className="text-xs text-(--primary-color)">
                Maria: Unela sam podatke{" "}
                <strong>{selectedService?.name}</strong> u{" "}
                <strong>{selectedTime}</strong>
              </p>
              <button
                onClick={() => {
                  if (!isRescheduleMode) markBlockConsumed(block.id, "booking_confirm", undefined, block.type);
                  handleConfirm();
                }}
                disabled={consumed}
                className="cursor-pointer bg-(--secondary-color)/80 hover:bg-(--secondary-color) text-white px-3 py-1 rounded-lg text-xs font-bold"
              >
                {consumed ? (
                  "Izabrano"
                ) : isPending ? (
                  <LoaderButton />
                ) : isRescheduleMode ? (
                  "Izaberi"
                ) : (
                  "Potvrdi"
                )}
              </button>
            </div>
          )}

          <div className="space-y-3">
            {/* Row 1 — Ime + Telefon — hidden in reschedule mode (contact already on file) */}
            {!isRescheduleMode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Ime i prezime"
                  value={clientName}
                  onChange={(e) => setters.setClientName(e.target.value)}
                  className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border-none text-sm outline-none"
                />
                <input
                  type="tel"
                  placeholder="Telefon"
                  value={clientPhone}
                  onChange={(e) => setters.setClientPhone(e.target.value)}
                  className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border-none text-sm outline-none"
                />
              </div>
            )}

            {/* Row 2 — Usluga + Datum (2 cols desktop, 1 mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={displayValues.serviceId}
                onChange={(e) => setters.setServiceId(e.target.value)}
                className="cursor-pointer w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border-none text-sm"
              >
                <option value="">Izaberite uslugu</option>
                {services.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setters.setDate(e.target.value)}
                className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border-none text-sm"
              />
            </div>

            {/* Variants */}
            {selectedService?.type === "variant" && (
              <div className="flex flex-wrap gap-2">
                {selectedService.variants?.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setters.setVariantName(v.name)}
                    disabled={consumed}
                    className={`cursor-pointer px-4 py-2 rounded-xl text-sm transition ${
                      activeVariant?.name === v.name
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}

            {/* Time grid */}
            <div className="grid grid-cols-4 gap-2">
              {timeOptions.map((t) => {
                const isOutside = workingHoursForDay?.isWorking
                  ? !isTimeBetween(
                      t,
                      workingHoursForDay.start!,
                      workingHoursForDay.end!,
                    )
                  : true;
                if (isOutside) return null;
                return (
                  <button
                    key={t}
                    onClick={() => setters.setTime(t)}
                    disabled={consumed}
                    className={`cursor-pointer p-2 rounded-lg text-xs ${selectedTime === t ? "bg-pink-500 text-white" : "bg-gray-50 hover:bg-gray-100"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
              <div className="text-xl font-black">
                {formatPriceToString(
                  activeVariant?.price || selectedService?.basePrice || 0,
                )}{" "}
                RSD
              </div>
              <button
                onClick={() => {
                  if (!isRescheduleMode) markBlockConsumed(block.id, "booking_confirm", undefined, block.type);
                  handleConfirm();
                }}
                disabled={isPending || !selectedTime || consumed}
                className="cursor-pointer px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold disabled:opacity-30"
              >
                {consumed ? (
                  "Izabrano"
                ) : isPending ? (
                  <LoaderButton />
                ) : isRescheduleMode ? (
                  "Izaberi novi termin"
                ) : (
                  "Zakaži termin"
                )}
              </button>
            </div>
            {consumed && <p style={consumedNoteStyle}>Izabrano</p>}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function AppointmentMetadataFallback({
  block,
  missingFields,
}: {
  block: AppointmentCalendarBlockType;
  missingFields: string[];
}) {
  return (
    <div style={fallbackStyle}>
      <p style={fallbackTitleStyle}>Nedostaju podaci za prikaz termina.</p>
      <p style={fallbackTextStyle}>{missingFields.join(", ")}</p>
      <button
        type="button"
        onClick={() => {
          sendSystemAction({
            action: "BOOKING_PAYLOAD_INCOMPLETE",
            source: "CalendarBlock",
            payload: {
              intent: "recover_missing_salon",
              missingFields,
              city: block.metadata.city,
              service: block.metadata.serviceName || block.metadata.service,
              salonId: block.metadata.salonId,
              salonName: block.metadata.salonName,
              sourceBlockId: block.id,
              sourceBlockType: block.type,
            },
            notifyAgent: true,
            visibleInThread: false,
          });
        }}
        style={fallbackButtonStyle}
      >
        Vrati me na izbor salona
      </button>
    </div>
  );
}

function PlatformAppointmentSummary({
  block,
}: {
  block: AppointmentCalendarBlockType;
}) {
  return (
    <div style={fallbackStyle}>
      <p style={fallbackTitleStyle}>
        {block.metadata.serviceName || block.metadata.service}
      </p>
      <p style={fallbackTextStyle}>
        {[block.metadata.salonName, block.metadata.city, block.metadata.date]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p style={fallbackTextStyle}>
        Prikaz termina je spreman za salon i uslugu. Ako se termini ne učitaju,
        izaberi salon ponovo.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--main-font)",
          fontSize: 12,
          color: "var(--fg-3)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--main-font)",
          fontSize: 13,
          color: "var(--fg-1)",
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "var(--surface)",
  border: "1px solid var(--border-1)",
  borderRadius: 12,
  fontFamily: "var(--main-font)",
  fontSize: 13,
  color: "var(--fg-1)",
  outline: "none",
  boxSizing: "border-box",
};

const fallbackStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  borderRadius: 18,
  padding: "18px 18px 16px",
  fontFamily: "var(--main-font)",
  textAlign: "center",
};

const fallbackTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 14,
  fontWeight: 700,
  color: "var(--fg-1)",
};

const fallbackTextStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--fg-3)",
  lineHeight: 1.45,
};

const fallbackButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  background: "var(--secondary-color)",
  color: "#fff",
  fontFamily: "var(--main-font)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const consumedNoteStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontFamily: "var(--main-font)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg-3)",
  textAlign: "center",
};
