// src/app/api/external/auth/[action]/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";

export async function POST(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  const body = await req.json();
  const { action } = await context.params;
  const MAIN_SITE_API = process.env.MAIN_SITE_API;

  try {
    const res = await fetch(`${MAIN_SITE_API}/auth/${action}`, {
      method: "POST",
      headers: platformHeaders(),
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const response = NextResponse.json(data);

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
    console.error("❌ Auth proxy error:", error);
    return NextResponse.json({ error: "Auth Proxy Error" }, { status: 500 });
  }
}
