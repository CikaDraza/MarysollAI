"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { FlatSlot } from "@/types/slots";

interface BookingModalContextValue {
  modalSlot: FlatSlot | null;
  openModal: (slot: FlatSlot, onSuccess?: () => void) => void;
  closeModal: () => void;
  triggerSuccess: () => void;
}

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: ReactNode }) {
  const [modalSlot, setModalSlot] = useState<FlatSlot | null>(null);
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  const openModal = (slot: FlatSlot, onSuccess?: () => void) => {
    setModalSlot(slot);
    onSuccessRef.current = onSuccess;
  };

  const closeModal = () => {
    setModalSlot(null);
    onSuccessRef.current = undefined;
  };

  const triggerSuccess = () => {
    onSuccessRef.current?.();
    onSuccessRef.current = undefined;
  };

  return (
    <BookingModalContext.Provider value={{ modalSlot, openModal, closeModal, triggerSuccess }}>
      {children}
    </BookingModalContext.Provider>
  );
}

export function useBookingModal() {
  const ctx = useContext(BookingModalContext);
  if (!ctx) throw new Error("useBookingModal must be used within BookingModalProvider");
  return ctx;
}
