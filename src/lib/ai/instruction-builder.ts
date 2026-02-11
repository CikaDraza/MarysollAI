// src/lib/ai/instruction-builder.ts

interface Appointment {
  date: string;
  time: string;
}

interface KnowledgeContext {
  allAppointments: Appointment[];
  servicesText: string;
}

export function getDynamicKnowledge(
  userQuery: string,
  context: KnowledgeContext,
) {
  const query = userQuery?.toLowerCase() || "";
  let specificKnowledge = "";

  // DODAJ OVU PROVERU - Osigurač
  const appointments = Array.isArray(context?.allAppointments)
    ? context.allAppointments
    : [];

  if (
    query.includes("termin") ||
    query.includes("zakaz") ||
    query.includes("slobodno")
  ) {
    const relevantSlots = appointments.filter((app: Appointment) => {
      // Oprezno sa datumima - new Date() može biti "Invalid Date"
      const appDate = new Date(app.date);
      if (isNaN(appDate.getTime())) return false;

      const diffInMs = appDate.getTime() - new Date().getTime();
      const daysDiff = diffInMs / (1000 * 3600 * 24);
      return daysDiff >= -1 && daysDiff <= 3; // -1 da uključi i današnje termine
    });

    specificKnowledge += `\n# KNOWLEDGE: APPOINTMENTS (Next 3 days)
    ${relevantSlots.length > 0 ? relevantSlots.map((a: Appointment) => `${a.date} ${a.time}`).join(", ") : "Svi termini su trenutno slobodni."}
    Pravilo: Ako klijent traži dalji datum, reci mu da otvori AppointmentCalendarBlock.`;
  }
  // ... ostatak koda
  return specificKnowledge;
}
