// src/app/api/ai/conversation/route.ts
import { rateLimit } from "@/helpers/rate-limit";
import { getRequestIP } from "@/helpers/request-ip";
import { askAgent } from "@/services/askAgent";
import { ThreadItem } from "@/types/ai/chat-thread";
import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserFromToken } from "@/lib/auth/auth-utils";

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function requiresVerifiedAuth(handoffPayload?: Record<string, unknown>): boolean {
  return (
    handoffPayload?.intent === "appointments" ||
    handoffPayload?.intent === "create_booking" ||
    handoffPayload?.intent === "resume_booking_after_login"
  );
}

export async function POST(req: Request) {
  const ip = getRequestIP();
  const key = `text:${ip}`;

  const limit = rateLimit(key, {
    windowMs: 60_000,
    max: 10,
  });

  if (!limit.allowed) {
    return NextResponse.json({ messages: [] }, { status: 200 });
  }

  try {
    const body = await req.json();
    const {
      message,
      isAuthenticated,
      history,
      userName,
      isBlockInteraction,
      bookingMemory,
      handoffPayload,
    } = body as {
      message: string;
      isAuthenticated: boolean;
      history: ThreadItem[];
      userName: string;
      isBlockInteraction?: boolean;
      bookingMemory?: CollectedBookingFields;
      handoffPayload?: Record<string, unknown>;
    };
    const requestToken =
      readBearerToken(req) ?? (await cookies()).get("token")?.value ?? null;
    const requestUser = requestToken ? getUserFromToken(requestToken) : null;
    const mustVerifyAuth = requiresVerifiedAuth(handoffPayload);
    const effectiveIsAuthenticated =
      Boolean(requestUser) || (!mustVerifyAuth && Boolean(isAuthenticated));
    const effectiveUserName = requestUser?.name || userName || "Gost";

    const stream = await askAgent(
      message,
      effectiveIsAuthenticated,
      history || [],
      effectiveUserName,
      isBlockInteraction ?? false,
      bookingMemory,
      handoffPayload,
    );

    // Vraćamo stream sa specijalnim headerima
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch AI" },
      { status: 500 },
    );
  }
}
