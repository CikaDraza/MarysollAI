"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { chatEvents } from "@/lib/ai/events/chatEvents";
import { mapAppointmentActionError } from "@/lib/api/appointmentActionErrors";
import type { IAppointment } from "@/types/appointments-type";

function authHeader(token?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function invalidateAppointmentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["appointments"] });
  queryClient.invalidateQueries({ queryKey: ["appointments-client"] });
}

export function useCancelAppointment(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      appointment,
      aiAssisted = false,
    }: {
      id: string;
      appointment?: IAppointment;
      aiAssisted?: boolean;
    }) => {
      const res = await fetch(`/api/external/appointments/${id}/cancel`, {
        method: "POST",
        headers: authHeader(token),
        body: JSON.stringify({ aiAssisted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(mapAppointmentActionError(data.error));
      }
      return { data, appointment, appointmentId: id, aiAssisted };
    },
    onSuccess: ({ appointment, appointmentId, aiAssisted }) => {
      invalidateAppointmentQueries(queryClient);
      toast.success("Termin je otkazan.");
      chatEvents.emit({
        type: "APPOINTMENT_CANCELLED",
        payload: { appointment, appointmentId },
        timestamp: Date.now(),
      });
      if (aiAssisted) {
        chatEvents.emit({
          type: "AGENT_RESPONSE",
          payload: {
            agentType: "appointments",
            content: "Termin je otkazan. Ako želite, mogu odmah da pronađem drugi termin.",
            completed: true,
          },
          timestamp: Date.now(),
        });
      }
    },
    onError: (error) => {
      toast.error(mapAppointmentActionError(error));
    },
  });
}

export function useUpdateAppointment(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
      appointment,
      aiAssisted = false,
    }: {
      id: string;
      payload: Partial<IAppointment> & { startTime?: string };
      appointment?: IAppointment;
      aiAssisted?: boolean;
    }) => {
      const res = await fetch(`/api/external/appointments/${id}/update`, {
        method: "PUT",
        headers: authHeader(token),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(mapAppointmentActionError(data.error));
      }
      return { data, appointment, appointmentId: id, payload, aiAssisted };
    },
    onSuccess: ({ appointment, appointmentId, payload, aiAssisted }) => {
      invalidateAppointmentQueries(queryClient);
      toast.success("Termin je izmenjen.");
      chatEvents.emit({
        type: "APPOINTMENT_UPDATED",
        payload: {
          appointment,
          appointmentId,
          date: payload.date,
          time: payload.time,
        },
        timestamp: Date.now(),
      });
      if (aiAssisted) {
        chatEvents.emit({
          type: "AGENT_RESPONSE",
          payload: {
            agentType: "appointments",
            content: payload.date && payload.time
              ? `Termin je izmenjen. Novi termin je ${payload.date} u ${payload.time}.`
              : "Termin je izmenjen.",
            completed: true,
          },
          timestamp: Date.now(),
        });
      }
    },
    onError: (error) => {
      toast.error(mapAppointmentActionError(error));
    },
  });
}

