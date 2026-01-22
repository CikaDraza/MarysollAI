// src/app/api/ai/conversation/route.ts
import { rateLimit } from "@/helpers/rate-limit";
import { getRequestIP } from "@/helpers/request-ip";
import { askAgent } from "@/services/gemini-text-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const ip = getRequestIP();
  const key = `text:${ip}`;

  const limit = rateLimit(key, {
    windowMs: 60_000,
    max: 10, // tekst je jeftiniji
  });

  if (!limit.allowed) {
    return NextResponse.json({ messages: [] }, { status: 200 });
  }

  try {
    const { message } = await req.json();

    const response = await askAgent(message);

    if (response.status === 429) {
      return NextResponse.json({ layout: [] }, { status: 200 });
    }

    return NextResponse.json({
      messages: response.messages,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Failed to fetch AI" },
      { status: 500 },
    );
  }
}
