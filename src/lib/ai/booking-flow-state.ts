// src/lib/ai/booking-flow-state.ts
//
// Phase 1 — Booking flow state machine.
// Tracks Claudia's booking progress so she stops re-asking for fields the user
// has already provided. Lives in a Zustand store so non-React code (orchestrator,
// agents) can read/write it.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  flowVersion: number;
  pendingSelectionFlowVersion?: number;
  /** Last user-stated intent ("Hocu masaza sutra ujutru"). Used for prompt context. */
  lastIntent: string;
  /** Epoch ms when the current flow snapshot was last touched. Used to drop
   * stale state on hydration so a 3-day-old browser tab doesn't resume a
   * conversation the user has long forgotten. */
  updatedAt: number;
}

interface BookingFlowActions {
  setState: (state: BookingFlowState) => void;
  /** Merge new fields into collected; never overwrites with undefined. */
  collect: (fields: Partial<CollectedBookingFields>) => void;
  bumpFlowVersion: (reason?: string) => number;
  startPendingSelectionFlow: () => number;
  cancelPendingSelectionFlow: () => number;
  setLastIntent: (intent: string) => void;
  /** Reset to idle (called when booking completes or chat is cleared). */
  reset: () => void;
}

const initialState: BookingFlowValue = {
  state: "idle",
  collected: {},
  flowVersion: 0,
  pendingSelectionFlowVersion: undefined,
  lastIntent: "",
  updatedAt: 0,
};

/** Persist progress for one hour so a refresh in the middle of a booking
 * flow doesn't wipe the user's selections. Anything older is treated as a
 * fresh session. */
const BOOKING_FLOW_TTL_MS = 60 * 60 * 1_000;
const BOOKING_FLOW_STORAGE_KEY = "marysoll_booking_flow";

const touch = <T extends Partial<BookingFlowValue>>(patch: T): T & { updatedAt: number } => ({
  ...patch,
  updatedAt: Date.now(),
});

export const useBookingFlow = create<BookingFlowValue & BookingFlowActions>()(
  persist(
    (set) => ({
      ...initialState,

      setState: (state) => set(touch({ state })),

      collect: (fields) =>
        set((prev) => {
          const next: CollectedBookingFields = { ...prev.collected };
          for (const [k, v] of Object.entries(fields)) {
            if (v !== undefined && v !== "") {
              (next as Record<string, string | number | null | undefined>)[k] = v;
            }
          }
          return touch({ collected: next });
        }),

      bumpFlowVersion: () => {
        let nextVersion = 0;
        set((prev) => {
          nextVersion = prev.flowVersion + 1;
          return touch({ flowVersion: nextVersion });
        });
        return nextVersion;
      },

      startPendingSelectionFlow: () => {
        let nextVersion = 0;
        set((prev) => {
          nextVersion = prev.flowVersion + 1;
          return touch({
            flowVersion: nextVersion,
            pendingSelectionFlowVersion: nextVersion,
          });
        });
        return nextVersion;
      },

      cancelPendingSelectionFlow: () => {
        let nextVersion = 0;
        set((prev) => {
          nextVersion = prev.flowVersion + 1;
          return touch({
            flowVersion: nextVersion,
            pendingSelectionFlowVersion: undefined,
          });
        });
        return nextVersion;
      },

      setLastIntent: (intent) => set(touch({ lastIntent: intent })),

      reset: () =>
        set((prev) => ({
          ...initialState,
          flowVersion: prev.flowVersion + 1,
          updatedAt: 0,
        })),
    }),
    {
      name: BOOKING_FLOW_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Only persist the snapshot fields; actions are re-attached on rehydrate.
      partialize: (state) => ({
        state: state.state,
        collected: state.collected,
        flowVersion: state.flowVersion,
        pendingSelectionFlowVersion: state.pendingSelectionFlowVersion,
        lastIntent: state.lastIntent,
        updatedAt: state.updatedAt,
      }),
      // Drop hydrated state if it exceeds the TTL — keeps the flow fresh
      // without leaking stale context across sessions.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<BookingFlowValue> | undefined;
        if (!persisted || !persisted.updatedAt) return currentState;
        if (Date.now() - persisted.updatedAt > BOOKING_FLOW_TTL_MS) {
          return currentState;
        }
        return { ...currentState, ...persisted };
      },
    },
  ),
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
