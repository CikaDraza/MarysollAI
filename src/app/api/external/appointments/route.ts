// app/api/external/appointments/route.ts
import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: Request) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  try {
    const { searchParams } = new URL(req.url);
    const externalUrl = `${MAIN_SITE_API}/appointments?${searchParams.toString()}`;

    const response = await axios.get(externalUrl);

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return NextResponse.json(
      { error: "Error fetching appointments" },
      { status: 500 },
    );
  }
}
