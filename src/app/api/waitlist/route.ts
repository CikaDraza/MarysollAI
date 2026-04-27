// src/app/api/waitlist/route.ts
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db/mongodb";
import { Waitlist } from "@/lib/models/Waitlist";
import type { IWaitlist } from "@/lib/models/Waitlist";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IWaitlist;

    if (!body.phone?.trim() || !body.service?.trim()) {
      return NextResponse.json(
        { error: "phone and service are required" },
        { status: 400 },
      );
    }

    await connectToDB();
    const entry = await Waitlist.create({
      name: body.name?.trim(),
      phone: body.phone.trim(),
      email: body.email?.trim(),
      service: body.service.trim(),
      city: body.city?.trim() ?? "",
      preferredTime: body.preferredTime?.trim(),
      instagram: body.instagram?.trim(),
      tiktok: body.tiktok?.trim(),
    });

    return NextResponse.json({ id: String(entry._id) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}
