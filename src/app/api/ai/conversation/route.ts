// src/app/api/ai/conversation/route.ts
import { askAgent } from "@/services/gemini-text-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const response = await askAgent(message);

    return NextResponse.json({
      messages: response.messages,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Failed to fetch AI" },
      { status: 500 }
    );
  }
}
