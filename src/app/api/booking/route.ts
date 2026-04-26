// src/app/api/booking/route.ts
import { NextResponse } from "next/server";
import { platformClient, CreateBookingPayload } from "@/lib/api/platformClient";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBookingPayload;

    if (!body.salonId || !body.serviceId || !body.startTime) {
      return NextResponse.json(
        { error: "salonId, serviceId and startTime are required" },
        { status: 400 },
      );
    }

    const result = await platformClient.createBooking(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Booking failed" },
      { status: 500 },
    );
  }
}
