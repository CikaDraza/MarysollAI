"use client";

import { useState } from "react";
import { AppointmentCalendarBlockType } from "@/types/landing-block";
import { Reveal } from "@/components/motion/Reveal";
import { formatDatePretty } from "@/helpers/formatISODate";
import { blockActionToSystemAction } from "@/lib/ai/layout/blockActionToSystemAction";

interface Props {
  block: AppointmentCalendarBlockType;
}

export default function LandingConfirmBlock({ block }: Props) {
  const [opened, setOpened] = useState(false);

  const meta = block.metadata;
  const serviceName = meta.service ?? meta.serviceName ?? block.query ?? "";
  const salonId = meta.salonId ?? "";
  const salonName = meta.salonName ?? "";
  const city = meta.city ?? "";
  const date = meta.date ?? "";
  const time = meta.time ?? "";

  if (!date || !time || !serviceName) return null;

  // Build ISO startTime: "2026-05-07" + "11:00" → "2026-05-07T11:00:00"
  const startTime = `${date}T${time}:00`;

  const handleConfirm = () => {
    if (opened) return;
    setOpened(true);
    blockActionToSystemAction("AppointmentCalendarBlock", "slot_selected", {
      selectedSlot: {
        salonId,
        salonName,
        city,
        serviceId: meta.serviceId || null,
        serviceName,
        category: meta.category ?? "",
        startTime,
        duration: meta.duration,
        price: meta.price,
        date,
        time,
      },
    });
  };

  const locationLabel = [salonName, city].filter(Boolean).join(", ");

  return (
    <Reveal>
      <div
        style={{
          background: "var(--surface-2)",
          borderRadius: 20,
          padding: "20px 20px 18px",
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 18,
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
            gap: 2,
            marginBottom: 24,
          }}
        >
          <Row label="Usluga" value={serviceName} />
          {locationLabel && <Row label="Salon" value={locationLabel} />}
          <Row label="Datum" value={formatDatePretty(date)} />
          <Row label="Vreme" value={time} />
        </div>

        <button
          onClick={handleConfirm}
          style={{
            width: "100%",
            cursor: "pointer",
            fontFamily: "var(--main-font)",
            fontWeight: 700,
            fontSize: 14,
            padding: "13px 0",
            borderRadius: 14,

            border: "1px solid var(--secondary-color)",
            color: "var(--secondary-color)",
            transition: "opacity 150ms",
          }}
        >
          Potvrdi termin
        </button>
      </div>
    </Reveal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: 36,
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
          fontSize: 14,
          color: "var(--fg-1)",
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  );
}
