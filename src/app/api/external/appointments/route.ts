// src/app/api/external/appointments/route.ts
import { NextResponse } from "next/server";
import { marketplaceHeaders } from "@/lib/api/marketplaceHeaders";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { IAppointment } from "@/types/appointments-type";

const MAIN_SITE_API = process.env.MAIN_SITE_API ?? "";

interface PlatformAppointmentsResponse {
  appointments?: IAppointment[];
  data?: IAppointment[] | { appointments?: IAppointment[] };
  items?: IAppointment[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  total?: number;
  [key: string]: unknown;
}

function normalizeResponse(raw: PlatformAppointmentsResponse, page: number, limit: number) {
  let appointments: IAppointment[] = [];

  if (Array.isArray(raw.appointments)) {
    appointments = raw.appointments;
  } else if (Array.isArray(raw.items)) {
    appointments = raw.items;
  } else if (Array.isArray(raw.data)) {
    appointments = raw.data as IAppointment[];
  } else if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    const nested = raw.data as { appointments?: IAppointment[] };
    if (Array.isArray(nested.appointments)) appointments = nested.appointments;
  }

  const totalCount = raw.pagination?.totalCount ?? raw.total ?? appointments.length;
  const totalPages = raw.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCount / limit));

  return {
    appointments,
    pagination: raw.pagination ?? {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

export async function GET(req: Request) {
  try {
    // Extract and verify the client's Bearer token to get their email.
    // We use email (not clientProfileId) because the user may have appointments
    // in multiple tenants with different clientProfileIds.
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    const user = token ? getUserFromToken(token) : null;
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));

    const params = new URLSearchParams({
      clientEmail: user.email,
      page: String(page),
      limit: String(limit),
    });
    if (searchParams.get("date")) params.set("date", searchParams.get("date")!);

    const externalUrl = `${MAIN_SITE_API}/marketplace/appointments?${params.toString()}`;
    const response = await fetch(externalUrl, {
      headers: marketplaceHeaders(),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text().catch(() => "");
      console.error("[appointments proxy] Non-JSON response", response.status, externalUrl, text.slice(0, 200));
      return NextResponse.json(
        { error: "Endpoint nije dostupan na platformi." },
        { status: 502 },
      );
    }

    const rawJson = (await response.json()) as PlatformAppointmentsResponse;

    if (!response.ok) {
      console.error("[appointments proxy] Platform error", response.status, rawJson);
      return NextResponse.json(rawJson, { status: response.status });
    }

    const normalized = normalizeResponse(rawJson, page, limit);

    console.log("[appointments proxy]", {
      email: user.email,
      status: response.status,
      rawKeys: Object.keys(rawJson),
      count: normalized.appointments.length,
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("[appointments proxy] Error:", error);
    return NextResponse.json({ error: "Error fetching appointments" }, { status: 500 });
  }
}
