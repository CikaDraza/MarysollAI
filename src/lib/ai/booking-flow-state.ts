// src/lib/ai/booking-flow-state.ts
//
// Phase 1 — Booking flow state machine.
// Tracks Claudia's booking progress so she stops re-asking for fields the user
// has already provided. Lives in a Zustand store so non-React code (orchestrator,
// agents) can read/write it.
import { create } from "zustand";

export type BookingFlowState =
  | "idle"
  | "collecting_service"
  | "collecting_city"
  | "collecting_time"
  | "searching"
  | "reviewing_slots"
  | "auth_required"
  | "confirming"
  | "completed";

export interface CollectedBookingFields {
  category?: string;
  subcategory?: string;
  service?: string;
  serviceId?: string;
  serviceName?: string;
  city?: string;
  date?: string;
  time?: string;
  timeWindowStart?: number | null;
  timeWindowEnd?: number | null;
  salonId?: string;
  salonName?: string;
}

interface BookingFlowValue {
  state: BookingFlowState;
  collected: CollectedBookingFields;
  /** Last user-stated intent ("Hocu masaza sutra ujutru"). Used for prompt context. */
  lastIntent: string;
}

interface BookingFlowActions {
  setState: (state: BookingFlowState) => void;
  /** Merge new fields into collected; never overwrites with undefined. */
  collect: (fields: Partial<CollectedBookingFields>) => void;
  setLastIntent: (intent: string) => void;
  /** Reset to idle (called when booking completes or chat is cleared). */
  reset: () => void;
}

const initialState: BookingFlowValue = {
  state: "idle",
  collected: {},
  lastIntent: "",
};

export const useBookingFlow = create<BookingFlowValue & BookingFlowActions>(
  (set) => ({
    ...initialState,

    setState: (state) => set({ state }),

    collect: (fields) =>
      set((prev) => {
        const next: CollectedBookingFields = { ...prev.collected };
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined && v !== "") {
            (next as Record<string, string | number | null | undefined>)[k] = v;
          }
        }
        return { collected: next };
      }),

    setLastIntent: (intent) => set({ lastIntent: intent }),

    reset: () => set({ ...initialState }),
  }),
);

/** Returns the list of REQUIRED fields still missing for a booking. */
export function getMissingBookingFields(
  collected: CollectedBookingFields,
): Array<keyof CollectedBookingFields> {
  const required: Array<keyof CollectedBookingFields> = ["service", "city"];
  return required.filter((k) => !collected[k]);
}

export const bookingFlow = {
  get: () => useBookingFlow.getState(),
  set: useBookingFlow.setState,
  subscribe: useBookingFlow.subscribe,
};
