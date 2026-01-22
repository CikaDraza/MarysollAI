import { connectToDB } from "@/lib/db/mongodb";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  await connectToDB();

  const body = await req.json();
  const { action } = await context.params;

  try {
    const res = await fetch(`https://www.marysoll.makeup/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Auth Proxy Error" },
      { status: 500 },
    );
  }
}
