import { NextResponse } from "next/server";
import { parseIntent } from "@/lib/intent/parseIntent";

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text?: string };

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const intent = parseIntent(text.trim());
    return NextResponse.json(intent);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
