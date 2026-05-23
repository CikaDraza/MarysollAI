import { useMemo } from "react";
import { useAppointmentsWithToken } from "@/hooks/useAppointmentsWithToken";
import { useAuthActions } from "@/hooks/useAuthActions";
import { useClientTestimonials } from "@/hooks/useClientTestimonials";
import type { IAppointment } from "@/types/appointments-type";
import type { ITestimonial } from "@/types/testimonials-type";
import type { PublicSalonTestimonial, SalonPreview } from "@/types/salon-preview";

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function readNestedId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const id = record._id ?? record.id;
  return typeof id === "string" ? id : "";
}

function appointmentMatchesSalon(appointment: IAppointment, salon: SalonPreview) {
  const record = appointment as IAppointment & {
    salonId?: unknown;
    tenantId?: unknown;
    salonProfile?: unknown;
    tenant?: unknown;
  };

  const ids = [
    readNestedId(record.salonId),
    readNestedId(record.tenantId),
    readNestedId(record.salonProfile),
    readNestedId(record.tenant),
    appointment.salonId,
    appointment.tenantId,
  ].filter(Boolean);

  if (ids.includes(salon.id)) return true;
  if (salon.tenantId && ids.includes(salon.tenantId)) return true;

  const appointmentSalonName = normalize(
    appointment.salonName ?? appointment.tenantName,
  );
  return Boolean(appointmentSalonName && appointmentSalonName === normalize(salon.name));
}

function testimonialAppointmentId(testimonial: ITestimonial<{ _id: string }>) {
  return typeof testimonial.appointmentId === "object"
    ? testimonial.appointmentId._id
    : "";
}

function toPublicTestimonial(
  testimonial: ITestimonial<{ _id: string; serviceName: string; date: string }>,
): PublicSalonTestimonial {
  return {
    _id: testimonial._id,
    clientName: testimonial.clientName,
    rating: testimonial.rating,
    comment: testimonial.comment,
    adminReply: testimonial.adminReply,
    createdAt: String(testimonial.createdAt ?? ""),
  };
}

export function useSalonClientFeedback(salon: SalonPreview) {
  const { user, token, isLoading: authLoading } = useAuthActions();
  const enabled = Boolean(user && token);

  const appointmentsQuery = useAppointmentsWithToken(token ?? "", {
    page: 1,
    limit: 100,
    clientEmail: user?.email ?? "",
    enabled,
  });

  const testimonialsQuery = useClientTestimonials(token ?? "", {
    status: "all",
    page: 1,
    limit: 100,
    enabled,
  });

  const completedAppointments = useMemo(() => {
    const appointments = appointmentsQuery.data?.appointments ?? [];
    return appointments.filter(
      (appointment) =>
        appointment.status === "completed" &&
        appointmentMatchesSalon(appointment, salon),
    );
  }, [appointmentsQuery.data?.appointments, salon]);

  const clientTestimonials = useMemo(() => {
    const completedIds = new Set(
      completedAppointments
        .map((appointment) => appointment._id)
        .filter((id): id is string => Boolean(id)),
    );

    return (testimonialsQuery.data?.testimonials ?? [])
      .filter((testimonial) =>
        completedIds.has(testimonialAppointmentId(testimonial)),
      )
      .map(toPublicTestimonial);
  }, [completedAppointments, testimonialsQuery.data?.testimonials]);

  const reviewedAppointmentIds = useMemo(
    () =>
      new Set(
        (testimonialsQuery.data?.testimonials ?? [])
          .map((testimonial) => testimonialAppointmentId(testimonial))
          .filter(Boolean),
      ),
    [testimonialsQuery.data?.testimonials],
  );

  const reviewableAppointments = useMemo(
    () =>
      completedAppointments.filter(
        (appointment) => appointment._id && !reviewedAppointmentIds.has(appointment._id),
      ),
    [completedAppointments, reviewedAppointmentIds],
  );

  return {
    isLoggedIn: Boolean(user && token),
    token: token ?? "",
    user,
    isLoading:
      authLoading || appointmentsQuery.isLoading || testimonialsQuery.isLoading,
    reviewableAppointments,
    clientTestimonials,
  };
}
