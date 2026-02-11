// src/app/api/ai/conversation/route.ts
import { rateLimit } from "@/helpers/rate-limit";
import { getRequestIP } from "@/helpers/request-ip";
import { askAgent } from "@/services/askAgent";
import { NextResponse } from "next/server";

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
    const { message, isAuthenticated, history, userName } = await req.json();

    const stream = await askAgent(
      message,
      isAuthenticated,
      history || [],
      userName,
    );

    // Vraćamo stream sa specijalnim headerima
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream", // Ključno za streaming
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("SERVER ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error && "Failed to fetch AI" },
      { status: 500 },
    );
  }
}
