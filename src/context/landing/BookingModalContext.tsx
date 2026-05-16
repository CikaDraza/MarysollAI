"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
  type NormalizedBookingPayload,
} from "@/lib/booking/bookingPayload";

const PENDING_BOOKING_KEY = "marysoll_pending_booking_slot";

export type BookingRecoveryReason =
  | "missing_salon"
  | "missing_start_time"
  | "missing_required_fields";

export interface BookingRecoveryRequest {
  reason: BookingRecoveryReason;
  originalSlot: BookingModalSlot;
  normalizedPayload: NormalizedBookingPayload | null;
  missingFields: string[];
}

interface BookingModalContextValue {
  modalSlot: BookingModalSlot | null;
  pendingSlot: BookingModalSlot | null;
  recoveryRequest: BookingRecoveryRequest | null;
  openModal: (slot: BookingModalSlot, onSuccess?: () => void) => void;
  closeModal: () => void;
  clearRecovery: () => void;
  persistPendingBooking: (slot: BookingModalSlot) => void;
  consumePendingBooking: () => BookingModalSlot | null;
  triggerSuccess: () => void;
}

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: ReactNode }) {
  const [modalSlot, setModalSlot] = useState<BookingModalSlot | null>(null);
  const [recoveryRequest, setRecoveryRequest] =
    useState<BookingRecoveryRequest | null>(null);
  const [pendingSlot, setPendingSlot] = useState<BookingModalSlot | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(PENDING_BOOKING_KEY);
      return raw ? (JSON.parse(raw) as BookingModalSlot) : null;
    } catch {
      return null;
    }
  });
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  const openModal = useCallback((slot: BookingModalSlot, onSuccess?: () => void) => {
    const normalizedPayload = normalizeBookingPayload(slot);
    const validation = validateBookingPayload(normalizedPayload);
    if (!validation.ok) {
      const reason: BookingRecoveryReason =
        validation.missingFields.includes("salonId") ||
        validation.missingFields.includes("salonName")
          ? "missing_salon"
          : validation.missingFields.includes("startTime")
            ? "missing_start_time"
            : "missing_required_fields";
      setRecoveryRequest({
        reason,
        originalSlot: slot,
        normalizedPayload,
        missingFields: validation.missingFields,
      });
      setModalSlot(null);
      return;
    }

    if (!normalizedPayload) return;

    setRecoveryRequest(null);
    setModalSlot(normalizedPayload.originalSlot);
    onSuccessRef.current = onSuccess;
  }, []);

  const closeModal = useCallback(() => {
    setModalSlot(null);
    onSuccessRef.current = undefined;
  }, []);

  const clearRecovery = useCallback(() => {
    setRecoveryRequest(null);
  }, []);

  const persistPendingBooking = useCallback((slot: BookingModalSlot) => {
    setPendingSlot(slot);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(slot));
    }
    console.debug("[BOOKING_PREFILL]", {
      selectedSlot: slot,
      restoredBookingState: { pending: true },
    });
  }, []);

  const consumePendingBooking = useCallback(() => {
    const slot = pendingSlot;
    setPendingSlot(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_BOOKING_KEY);
    }
    return slot;
  }, [pendingSlot]);

  const triggerSuccess = useCallback(() => {
    onSuccessRef.current?.();
    onSuccessRef.current = undefined;
    setPendingSlot(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_BOOKING_KEY);
    }
  }, []);

  return (
    <BookingModalContext.Provider
      value={{
        modalSlot,
        pendingSlot,
        recoveryRequest,
        openModal,
        closeModal,
        clearRecovery,
        persistPendingBooking,
        consumePendingBooking,
        triggerSuccess,
      }}
    >
      {children}
    </BookingModalContext.Provider>
  );
}

export function useBookingModal() {
  const ctx = useContext(BookingModalContext);
  if (!ctx) throw new Error("useBookingModal must be used within BookingModalProvider");
  return ctx;
}
