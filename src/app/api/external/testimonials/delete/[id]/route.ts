// src/app/api/external/testimonials/delete/[id]/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;
  const { id } = await params;
  try {
    const authHeader = req.headers.get("authorization") ?? "";

    const response = await fetch(`${MAIN_SITE_API}/testimonials/delete/${id}`, {
      method: "DELETE",
      headers: platformHeaders({ Authorization: authHeader }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Bridge Error:", error);
    return NextResponse.json({ error: "Greška u mostu ka API-ju" }, { status: 500 });
  }
}
