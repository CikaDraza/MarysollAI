import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { platformHeaders } from "@/lib/api/platformHeaders";
import { mapAppointmentActionError } from "@/lib/api/appointmentActionErrors";

const MAIN_SITE_API = process.env.MAIN_SITE_API ?? "";

function readBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader
    : "";
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const authHeader =
      readBearerToken(req) ||
      ((await cookies()).get("token")?.value
        ? `Bearer ${(await cookies()).get("token")?.value}`
        : "");
    const body = await req.json().catch(() => ({}));

    const response = await fetch(
      `${MAIN_SITE_API}/appointments/client/${encodeURIComponent(id)}/update`,
      {
        method: "PUT",
        headers: platformHeaders({
          ...(authHeader ? { Authorization: authHeader } : {}),
        }),
        body: JSON.stringify(body),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: mapAppointmentActionError(JSON.stringify(data)) },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, ...data }, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: mapAppointmentActionError(error) },
      { status: 500 },
    );
  }
}
