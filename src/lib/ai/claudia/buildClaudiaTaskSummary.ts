// src/lib/ai/claudia/buildClaudiaTaskSummary.ts
//
// Per-turn structured working state for Claudia. This is a THIN ASSEMBLER over
// resolvers Claudia already computes (mergedBookingContext, getMissingBookingFields,
// parseClaudiaDirectIntent.type) — it adds NO new parsing/regex, so the "next
// step" it shows can never disagree with the block the server actually renders.

import {
  getMissingBookingFields,
  type CollectedBookingFields,
} from "@/lib/ai/booking-flow-state";

export type ClaudiaTaskType =
  | "booking"
  | "price"
  | "salon_info"
  | "appointment_management"
  | "notify_me"
  | "correction"
  | "closing"
  | "unknown";

export type ClaudiaNextStep =
  | "ask_city"
  | "ask_service"
  | "ask_date"
  | "ask_time"
  | "show_prices"
  | "show_slots"
  | "show_salons"
  | "confirm_booking"
  | "show_appointments"
  | "recover"
  | "answer";

export interface ClaudiaTaskSummary {
  likelyTask: ClaudiaTaskType;
  known: {
    city?: string;
    service?: string;
    category?: string;
    salonName?: string;
    variantName?: string;
    date?: string;
    time?: string;
    appointmentId?: string;
  };
  missing: string[];
  changed: string[];
  nextBestStep: ClaudiaNextStep;
}

/** Map parseClaudiaDirectIntent.type → operating-model task type. */
function taskFromDirectType(
  directType: string | undefined,
  hasContext: boolean,
): ClaudiaTaskType {
  switch (directType) {
    case "prices":
      return "price";
    case "salon_info":
    case "service_info":
      return "salon_info";
    case "appointments":
      return "appointment_management";
    case "notify_me":
      return "notify_me";
    case "auth":
      return "unknown";
    case "booking":
      return "booking";
    case "follow_up":
      return hasContext ? "booking" : "unknown";
    default:
      return hasContext ? "booking" : "unknown";
  }
}

function nextStepFor(
  task: ClaudiaTaskType,
  k: ClaudiaTaskSummary["known"],
): ClaudiaNextStep {
  if (task === "appointment_management") return "show_appointments";
  if (task === "closing") return "answer";
  if (task === "notify_me") return k.service ? "answer" : "ask_service";
  if (task === "price") {
    if (!k.service) return "ask_service";
    if (!k.city && !k.salonName) return "ask_city";
    return "show_prices";
  }
  // booking / salon_info / default
  if (!k.service) return "ask_service";
  if (!k.city && !k.salonName) return "ask_city";
  if (!k.salonName) return "show_salons";
  if (!k.date) return "ask_date";
  return "show_slots";
}

export function buildClaudiaTaskSummary(input: {
  /** mergedBookingContext — the fields Claudia has resolved this turn. */
  known: CollectedBookingFields;
  /** parseClaudiaDirectIntent(...).type */
  directType?: string;
  /** fields the user changed/corrected this turn (from the correction flow). */
  changed?: string[];
  appointmentId?: string;
}): ClaudiaTaskSummary {
  const c = input.known ?? {};
  const hasContext = Boolean(c.service || c.city || c.salonName);
  const isCorrection = (input.changed?.length ?? 0) > 0;
  const likelyTask: ClaudiaTaskType = isCorrection
    ? "correction"
    : taskFromDirectType(input.directType, hasContext);

  const known: ClaudiaTaskSummary["known"] = {
    city: c.city,
    service: c.service ?? c.serviceName,
    category: c.category,
    salonName: c.salonName,
    date: c.date,
    time: c.time,
    appointmentId: input.appointmentId,
  };

  const missing = getMissingBookingFields(c).map(String);
  // booking also wants a date once service+city/salon are known
  if (
    (likelyTask === "booking" || likelyTask === "correction") &&
    !c.date &&
    !missing.includes("date")
  ) {
    missing.push("date");
  }

  const baseTask = likelyTask === "correction" ? "booking" : likelyTask;
  const nextBestStep = nextStepFor(baseTask, known);

  return {
    likelyTask,
    known: {
      city: known.city,
      service: known.service,
      category: known.category,
      salonName: known.salonName,
      variantName: known.variantName,
      date: known.date,
      time: known.time,
      appointmentId: known.appointmentId,
    },
    missing,
    changed: input.changed ?? [],
    nextBestStep,
  };
}

function kvLine(known: ClaudiaTaskSummary["known"]): string {
  const parts = Object.entries(known)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(", ") : "ništa";
}

/** Compact block injected into the Claudia prompt — guidance only. */
export function formatClaudiaTaskStateForPrompt(s: ClaudiaTaskSummary): string {
  return [
    "",
    "# TRENUTNO STANJE ZADATKA",
    `Zadatak: ${s.likelyTask}`,
    `Znam: ${kvLine(s.known)}`,
    `Fali: ${s.missing.length ? s.missing.join(", ") : "ništa"}`,
    `Promenjeno: ${s.changed.length ? s.changed.join(", ") : "ništa"}`,
    `Sledeći korak: ${s.nextBestStep}`,
    "",
  ].join("\n");
}
