"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeBookingPayload,
  validateBookingPayload,
  type BookingModalSlot,
} from "@/lib/booking/bookingPayload";
import { uiCommandBus } from "@/lib/ai/ui/ui-command-executor";
import { handleRecoveryEvent } from "@/lib/ai/recovery/recovery-engine";
import type { RecoveryReason } from "@/lib/ai/recovery/recovery-types";

const PENDING_BOOKING_KEY = "marysoll_pending_booking_slot";

interface BookingModalContextValue {
  modalSlot: BookingModalSlot | null;
  pendingSlot: BookingModalSlot | null;
  openModal: (slot: BookingModalSlot, onSuccess?: () => void) => void;
  closeModal: () => void;
  persistPendingBooking: (slot: BookingModalSlot) => void;
  consumePendingBooking: () => BookingModalSlot | null;
  triggerSuccess: () => void;
}

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: ReactNode }) {
  const [modalSlot, setModalSlot] = useState<BookingModalSlot | null>(null);
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
      const reason: RecoveryReason =
        validation.missingFields.includes("salonId") ||
        validation.missingFields.includes("salonName")
          ? "missing_salon"
          : validation.missingFields.includes("startTime") ||
              validation.missingFields.includes("date") ||
              validation.missingFields.includes("time")
            ? "missing_start_time"
            : validation.missingFields.includes("serviceId") ||
                validation.missingFields.includes("serviceName")
              ? "missing_service"
              : "unknown";
      handleRecoveryEvent({
        type: "recovery",
        reason,
        severity: "recoverable",
        source: "BookingModal",
        payload: {
          selectedSlot: slot,
          missingFields: validation.missingFields,
          service: normalizedPayload?.serviceName || slot.serviceName,
          city: normalizedPayload?.city || slot.city,
          date: normalizedPayload?.date,
          time: normalizedPayload?.time,
        },
        notifyAgent: true,
        visibleInThread: false,
        timestamp: Date.now(),
      });
      setModalSlot(null);
      return;
    }

    if (!normalizedPayload) return;

    setModalSlot(normalizedPayload.originalSlot);
    onSuccessRef.current = onSuccess;
  }, []);

  const closeModal = useCallback(() => {
    setModalSlot(null);
    onSuccessRef.current = undefined;
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

  useEffect(() => {
    return uiCommandBus.subscribe((command) => {
      if (command.type === "OPEN_BOOKING_MODAL") {
        openModal(command.payload);
        return;
      }
      if (command.type === "CLOSE_BOOKING_MODAL") {
        closeModal();
      }
    });
  }, [closeModal, openModal]);

  return (
    <BookingModalContext.Provider
      value={{
        modalSlot,
        pendingSlot,
        openModal,
        closeModal,
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
