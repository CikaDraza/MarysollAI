// POST /api/ai/episodes
//
// Faza 6 — upis strukturisanih epizoda koje se razrešavaju na KLIJENTU
// (stvarni platform write je već prošao): potvrđena rezervacija, NotifyMe,
// otkazivanje, izmena termina. Server-resolved događaji (cenovnik, nema
// termina, konflikt) upisuje askAgent direktno.
//
// Telo NIKADA ne sme da nosi PII — prihvatamo samo strukturisana polja.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { recordAgentEpisode } from "@/lib/ai/memory/agentEpisodeStore";
import type {
  AgentEpisodeOutcome,
  AgentEpisodeType,
} from "@/lib/models/AgentEpisode";

const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "booking",
  "price",
  "search",
  "notify",
  "appointment_update",
  "appointment_cancel",
]);

const ALLOWED_OUTCOMES: ReadonlySet<string> = new Set([
  "success",
  "failed",
  "slot_taken",
  "no_slots",
  "notify_created",
  "cancelled",
  "updated",
  "viewed",
]);

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const type = str(body.type);
    const outcome = str(body.outcome);
    const conversationId = str(body.conversationId);
    if (
      !conversationId ||
      !type ||
      !outcome ||
      !ALLOWED_TYPES.has(type) ||
      !ALLOWED_OUTCOMES.has(outcome)
    ) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const token = readBearer(req) ?? (await cookies()).get("token")?.value ?? null;
    const user = token ? getUserFromToken(token) : null;

    await recordAgentEpisode({
      conversationId,
      userId: user?.id,
      guestSessionId: user ? undefined : str(body.guestSessionId),
      type: type as AgentEpisodeType,
      outcome: outcome as AgentEpisodeOutcome,
      city: str(body.city),
      service: str(body.service),
      category: str(body.category),
      salonId: str(body.salonId),
      salonName: str(body.salonName),
      date: str(body.date),
      time: str(body.time),
      recoveryUsed: body.recoveryUsed === true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/ai/episodes] failed:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
