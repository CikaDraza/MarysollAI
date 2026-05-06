// src/app/api/booking/route.ts
import { NextResponse } from "next/server";
import { platformClient, CreateBookingPayload } from "@/lib/api/platformClient";

interface BookingRequestBody extends Omit<CreateBookingPayload, "serviceId"> {
  serviceId?: string;
  serviceName?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookingRequestBody;

    if (!body.salonId || !body.startTime) {
      return NextResponse.json(
        { error: "salonId and startTime are required" },
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Booking failed" },
      { status: 500 },
    );
  }
}
