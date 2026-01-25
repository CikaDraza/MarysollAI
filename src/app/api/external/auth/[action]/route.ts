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

    const response = NextResponse.json(data);

    // ⬇⬇⬇ KRITIČNI DEO ⬇⬇⬇
    response.cookies.set("token", data.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      domain: "marysoll-assistant.website",
    });

    response.cookies.set("refreshToken", data.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      domain: "marysoll-assistant.website",
    });

    return response;
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error && "Auth Proxy Error" },
      { status: 500 },
    );
  }
}
