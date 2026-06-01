import { create } from "zustand";
import type { IAppointment } from "@/types/appointments-type";

interface RescheduleFlowValue {
  active: boolean;
  appointmentId: string | null;
  appointment: IAppointment | null;
}

interface RescheduleFlowActions {
  start: (appointmentId: string, appointment: IAppointment) => void;
  clear: () => void;
}

type RescheduleFlowStore = RescheduleFlowValue & RescheduleFlowActions;

const INITIAL: RescheduleFlowValue = {
  active: false,
  appointmentId: null,
  appointment: null,
};

const useRescheduleFlowStore = create<RescheduleFlowStore>((set) => ({
  ...INITIAL,
  start: (appointmentId, appointment) =>
    set({ active: true, appointmentId, appointment }),
  clear: () => set(INITIAL),
}));

export const rescheduleFlow = {
  get: () => useRescheduleFlowStore.getState(),
  start: (appointmentId: string, appointment: IAppointment) =>
    useRescheduleFlowStore.getState().start(appointmentId, appointment),
  clear: () => useRescheduleFlowStore.getState().clear(),
};

export { useRescheduleFlowStore };
