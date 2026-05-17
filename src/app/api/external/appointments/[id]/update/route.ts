import { NextResponse } from "next/server";
import { marketplaceHeaders } from "@/lib/api/marketplaceHeaders";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { mapAppointmentActionError } from "@/lib/api/appointmentActionErrors";

const MAIN_SITE_API = process.env.MAIN_SITE_API ?? "";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    const user = token ? getUserFromToken(token) : null;
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    // Inject clientEmail from the verified token — client cannot spoof this.
    const body = JSON.stringify({ ...clientBody, clientEmail: user.email });

    const response = await fetch(
      `${MAIN_SITE_API}/marketplace/appointments/${encodeURIComponent(id)}/update`,
      {
        method: "PUT",
        headers: marketplaceHeaders(body),
        body,
      },
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ error: "Endpoint nije dostupan na platformi." }, { status: 502 });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: mapAppointmentActionError(JSON.stringify(data)) },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { error: mapAppointmentActionError(error) },
      { status: 500 },
    );
  }
}
