"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { FlatSlot } from "@/types/slots";

interface BookingModalContextValue {
  modalSlot: FlatSlot | null;
  openModal: (slot: FlatSlot) => void;
  closeModal: () => void;
}

const BookingModalContext = createContext<BookingModalContextValue | null>(null);

export function BookingModalProvider({ children }: { children: ReactNode }) {
  const [modalSlot, setModalSlot] = useState<FlatSlot | null>(null);

  return (
    <BookingModalContext.Provider
      value={{
        modalSlot,
        openModal: setModalSlot,
        closeModal: () => setModalSlot(null),
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
