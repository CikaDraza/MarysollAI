import { IAppointment } from "@/types/appointments-type";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

export function useAppointmentMutations(token?: string) {
  const queryClient = useQueryClient();

  const createAppointment = useMutation({
    mutationFn: async (payload: IAppointment) => {
      const res = await fetch("/api/appointments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Greška pri kreiranju termina");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Termin uspešno zakazan.");
    },
  });

  const updateAppointment = useMutation({
    mutationFn: async ({
      id,
      updatedData,
    }: {
      id: string;
      updatedData: Partial<IAppointment>;
    }) => {
      const res = await fetch(`/api/appointments/update/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedData),
      });

      if (!res.ok) throw new Error("Greška pri ažuriranju termina");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Termin je pomeren.");
    },
  });

  const updateAppointmentStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      proposedDate,
      proposedTime,
      note,
    }: {
      id: string;
      status: IAppointment["status"];
      proposedDate?: string;
      proposedTime?: string;
      note?: string;
    }) => {
      const updateData: Partial<IAppointment> & { lastUpdatedBy: string } = {
        status,
        lastUpdatedBy: "admin",
      };

      if (proposedDate) updateData.proposedDate = proposedDate;
      if (proposedTime) updateData.proposedTime = proposedTime;
      if (note) updateData.note = note;

      const res = await fetch(`/api/appointments/update/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) throw new Error("Greška pri ažuriranju statusa termina");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Status termina ažuriran.");
    },
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/appointments/delete/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Greška pri brisanju termina");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Termin je obrisan.");
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      appointmentId,
      message,
    }: {
      appointmentId: string;
      message: string;
    }) => {
      const res = await fetch("/api/appointments/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ appointmentId, message }),
      });

      if (!res.ok) throw new Error("Greška pri slanju poruke");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  return {
    createAppointment,
    updateAppointment,
    deleteAppointment,
    updateAppointmentStatus,
    sendMessage,
  };
}
