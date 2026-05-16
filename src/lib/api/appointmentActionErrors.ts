export function mapAppointmentActionError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const embeddedJson = raw.match(/\{.*\}/)?.[0];
  if (embeddedJson) {
    try {
      const parsed = JSON.parse(embeddedJson) as { error?: unknown; message?: unknown };
      const nested =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : undefined;
      if (nested) return mapAppointmentActionError(nested);
    } catch {
      // Continue with text matching below.
    }
  }

  if (/isteklo|expired|late.?cancel|cancellation.*window/i.test(raw)) {
    return "Vreme za otkazivanje termina je isteklo.";
  }
  if (/not.?found|nije prona/i.test(raw)) {
    return "Termin nije pronađen.";
  }
  if (/unauthori[sz]ed|forbidden|401|403|prijavljen/i.test(raw)) {
    return "Morate biti prijavljeni da biste upravljali terminom.";
  }
  return "Trenutno nije moguće izmeniti termin. Pokušajte ponovo.";
}

