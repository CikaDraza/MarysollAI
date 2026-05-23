"use client";

import ClientBlockAppointments from "@/components/blocks/ClientBlockAppointments";
import { useAuthActions } from "@/hooks/useAuthActions";

export default function SalonAppointmentsBlock() {
  const { user, isLoading } = useAuthActions();

  if (isLoading || !user) return null;

  return (
    <section className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="mb-5">
        <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[var(--secondary-color)]">
          Klijent
        </p>
        <h2 className="m-0 mt-1 text-2xl font-black text-[var(--fg-1)]">
          Moji termini
        </h2>
      </div>
      <ClientBlockAppointments appointmentListMode="all" />
    </section>
  );
}
