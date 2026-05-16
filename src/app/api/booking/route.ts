// src/app/api/booking/route.ts
import { NextResponse } from "next/server";
import { platformClient, CreateBookingPayload } from "@/lib/api/platformClient";
import { BOOKING_CONFLICT_MESSAGE } from "@/lib/booking/bookingPayload";

interface BookingRequestBody extends Omit<CreateBookingPayload, "serviceId"> {
  serviceId?: string;
  serviceName?: string;
}

function cleanBookingError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : "Zakazivanje trenutno nije uspelo. Pokušajte ponovo za trenutak.";
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
      if (nested) return cleanBookingError(new Error(nested));
    } catch {
      // Keep using pattern matching below.
    }
  }
  if (/ime i telefon su obavezni/i.test(raw)) {
    return "Unesite telefon, email ili Instagram da salon može da potvrdi termin.";
  }
  if (/Platform API \d+/i.test(raw)) {
    return "Zakazivanje trenutno nije uspelo. Pokušajte ponovo za trenutak.";
  }
  return raw;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookingRequestBody;

    if (!body.salonId || !body.startTime) {
      return NextResponse.json(
        { error: "Nedostaje salon ili termin. Pokušavam da pronađem odgovarajući salon." },
        { status: 400 },
      );
    }

    let serviceId = body.serviceId;

    // If serviceId is missing, look it up by serviceName from the platform
    if (!serviceId && body.serviceName && body.salonId) {
      try {
        const services = await platformClient.getSalonServices(body.salonId);
        const match = services.find((s) =>
          s.name.toLowerCase().includes(body.serviceName!.toLowerCase()) ||
          body.serviceName!.toLowerCase().includes(s.name.toLowerCase()),
        );
        serviceId = match?._id ?? match?.id ?? "";
      } catch {
        // proceed without serviceId — let platform decide
      }
    }

    if (!serviceId) {
      return NextResponse.json(
        { error: "Usluga nije pronađena. Pokušajte ponovo." },
        { status: 400 },
      );
    }

    const result = await platformClient.createBooking({
      ...body,
      serviceId,
    } as CreateBookingPayload);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "";
    // Propagate slot-conflict as 409 with SLOT_TAKEN code so the client can
    // trigger AI recovery rather than showing a generic error toast.
    if (/Platform API 409/i.test(errMsg)) {
      return NextResponse.json(
        { error: BOOKING_CONFLICT_MESSAGE, code: "SLOT_TAKEN" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: cleanBookingError(err) },
      { status: 500 },
    );
  }
}
