import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;
  try {
    const authHeader = req.headers.get("authorization");
    const body = await req.json();

    // Prosleđujemo zahtev na pravi Marysoll API
    const response = await fetch(`${MAIN_SITE_API}/appointments/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Bridge Error:", error);
    return NextResponse.json(
      { error: "Greška u mostu ka API-ju" },
      { status: 500 },
    );
  }
}
