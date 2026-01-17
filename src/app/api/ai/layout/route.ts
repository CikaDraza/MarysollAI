// src/app/api/ai/conversation/route.ts
import { suggestionAgent } from "@/services/gemini-layout-suggestion";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const response = await suggestionAgent(message);

    return NextResponse.json({ layout: response.blocks });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Stream error" },
      { status: 500 },
    );
  }
}
