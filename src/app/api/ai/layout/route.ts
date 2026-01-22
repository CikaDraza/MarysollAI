// src/app/api/ai/conversation/route.ts
import { rateLimit } from "@/helpers/rate-limit";
import { getRequestIP } from "@/helpers/request-ip";
import { suggestionAgent } from "@/services/gemini-layout-suggestion";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const ip = getRequestIP();
  const key = `layout:${ip}`;

  const limit = rateLimit(key, {
    windowMs: 60_000, // 1 minut
    max: 5, // max 5 layout poziva / minut / IP
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { layout: [] },
      { status: 200 }, // važno: UI ne puca
    );
  }

  try {
    const { message } = await req.json();
    const response = await suggestionAgent(message);

    if (response.status === 429) {
      return NextResponse.json({ layout: [] }, { status: 200 });
    }

    return NextResponse.json({ layout: response.blocks });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Stream error" },
      { status: 500 },
    );
  }
}
