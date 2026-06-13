// src/app/api/ai/conversation/route.ts
import { rateLimit } from "@/helpers/rate-limit";
import { getRequestIP } from "@/helpers/request-ip";
import { askAgent } from "@/services/askAgent";
import { ensureCityCatalog } from "@/lib/cities-runtime";
import { ThreadItem } from "@/types/ai/chat-thread";
import type { CollectedBookingFields } from "@/lib/ai/booking-flow-state";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { platformHeaders } from "@/lib/api/platformHeaders";
import {
  encodeSseFrame,
  statusMessageForIntent,
  type ClaudiaStreamFrame,
} from "@/lib/ai/sse-frames";

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

// Faza 7 — perceptivna latencija. Pre spore operacije (LLM/pretraga) klijentu
// odmah šaljemo "status" okvir ("Molimo vas sačekajte, proveravamo…"), pa tek
// onda "final" okvir sa kompletnim Claudia odgovorom. Format i status tekst
// dele se sa klijentom kroz src/lib/ai/sse-frames.ts.

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

function sseFrame(payload: ClaudiaStreamFrame): Uint8Array {
  return new TextEncoder().encode(encodeSseFrame(payload));
}

async function readStreamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    out +=
      typeof value === "string" ? value : decoder.decode(value, { stream: true });
  }
}

function requiresVerifiedAuth(handoffPayload?: Record<string, unknown>): boolean {
  return (
    handoffPayload?.intent === "appointments" ||
    handoffPayload?.intent === "cancel_appointment" ||
    handoffPayload?.intent === "update_appointment" ||
    handoffPayload?.intent === "create_booking" ||
    handoffPayload?.intent === "resume_booking_after_login"
  );
}

function needsAppointmentContext(handoffPayload?: Record<string, unknown>): boolean {
  return (
    handoffPayload?.intent === "cancel_appointment" ||
    handoffPayload?.intent === "update_appointment"
  );
}

async function fetchClientAppointments(token: string | null, email?: string) {
  const MAIN_SITE_API = process.env.MAIN_SITE_API;
  if (!MAIN_SITE_API || !token) return [];

  try {
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (email) {
      params.set("clientEmail", email);
    }
    const response = await fetch(`${MAIN_SITE_API}/appointments?${params.toString()}`, {
      headers: platformHeaders({ Authorization: `Bearer ${token}` }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.appointments) ? data.appointments : [];
  } catch (error) {
    console.error("[CLAUDIA_APPOINTMENTS] fetch failed:", error);
    return [];
  }
}

export async function POST(req: Request) {
  const ip = getRequestIP();
  const key = `text:${ip}`;

  const limit = rateLimit(key, {
    windowMs: 60_000,
    max: 10,
  });

  if (!limit.allowed) {
    // An empty body renders as silence in the chat — a dead end. Return a
    // normal assistant message in the legacy ClaudiaResponse shape instead.
    return NextResponse.json(
      {
        messages: [
          {
            role: "assistant",
            content:
              "Primili smo više zahteva odjednom — sačekajte par sekundi pa pokušajte ponovo.",
          },
        ],
        layout: [],
        intent: {},
      },
      { status: 200 },
    );
  }

  try {
    // Hydrate the dynamic city catalog so the agent sees every marketplace city.
    await ensureCityCatalog();

    const body = await req.json();
    const {
      message,
      isAuthenticated,
      history,
      userName,
      isBlockInteraction,
      bookingMemory,
      handoffPayload,
      userCity,
      conversationId,
      guestSessionId,
      selectedModelId,
    } = body as {
      message: string;
      isAuthenticated: boolean;
      history: ThreadItem[];
      userName: string;
      isBlockInteraction?: boolean;
      bookingMemory?: CollectedBookingFields;
      handoffPayload?: Record<string, unknown>;
      userCity?: string;
      conversationId?: string;
      guestSessionId?: string;
      selectedModelId?: string;
    };
    const requestToken =
      readBearerToken(req) ?? (await cookies()).get("token")?.value ?? null;
    const requestUser = requestToken ? getUserFromToken(requestToken) : null;
    const mustVerifyAuth = requiresVerifiedAuth(handoffPayload);
    const effectiveIsAuthenticated =
      Boolean(requestUser) || (!mustVerifyAuth && Boolean(isAuthenticated));
    const effectiveUserName = requestUser?.name || userName || "Gost";
    const effectiveHandoffPayload =
      needsAppointmentContext(handoffPayload) &&
      !Array.isArray(handoffPayload?.appointments)
        ? {
            ...handoffPayload,
            appointments: await fetchClientAppointments(
              requestToken,
              requestUser?.email,
            ),
          }
        : handoffPayload;

    // Faza 7 — framed SSE: status okvir odmah (perceptivna latencija), pa
    // final okvir tek kada askAgent završi spore operacije. Status se flush-uje
    // pre `await askAgent(...)` koji blokira dok traje pretraga/LLM.
    const statusMessage = statusMessageForIntent(
      effectiveHandoffPayload,
      isBlockInteraction ?? false,
    );
    const sseStream = new ReadableStream({
      async start(controller) {
        controller.enqueue(sseFrame({ type: "status", message: statusMessage }));
        try {
          const inner = await askAgent(
            message,
            effectiveIsAuthenticated,
            history || [],
            effectiveUserName,
            isBlockInteraction ?? false,
            bookingMemory,
            effectiveHandoffPayload,
            typeof userCity === "string" ? userCity : undefined,
            {
              conversationId:
                typeof conversationId === "string" ? conversationId : undefined,
              // Logged-in episodes key on userId; guest id only for guests.
              userId: requestUser?.id,
              guestSessionId: requestUser
                ? undefined
                : typeof guestSessionId === "string"
                  ? guestSessionId
                  : undefined,
            },
            typeof selectedModelId === "string" ? selectedModelId : undefined,
          );
          const json = await readStreamToString(inner);
          let response: unknown;
          let usage: unknown;
          try {
            response = JSON.parse(json);
            // Model Lab — podigni __meta (usage telemetrija) u poseban kanal,
            // pa ga ukloni iz response-a (klijentski parser ga ignoriše ionako).
            if (response && typeof response === "object") {
              const obj = response as Record<string, unknown>;
              usage = obj.__meta;
              delete obj.__meta;
            }
          } catch {
            response = {
              messages: [
                {
                  role: "assistant",
                  content:
                    "Izvinite, došlo je do kratkog zastoja. Pošaljite poruku još jednom.",
                },
              ],
              layout: [],
              intent: {},
            };
          }
          controller.enqueue(sseFrame({ type: "final", response, usage }));
        } catch (error) {
          console.error("[conversation] askAgent failed:", error);
          controller.enqueue(
            sseFrame({
              type: "final",
              response: {
                messages: [
                  {
                    role: "assistant",
                    content:
                      "Nažalost, provera nije uspela. Pokušajte ponovo — vaši podaci su sačuvani.",
                  },
                ],
                layout: [],
                intent: {},
              },
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(sseStream, { headers: SSE_HEADERS });
  } catch (error: unknown) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch AI" },
      { status: 500 },
    );
  }
}
