// src/app/api/external/auth/[action]/route.ts
import { NextResponse } from "next/server";
import { platformHeaders } from "@/lib/api/platformHeaders";
import crypto from "crypto";

const MAIN_SITE_API = process.env.MAIN_SITE_API ?? "";
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY ?? "";
const PLATFORM_API_SECRET = process.env.PLATFORM_API_SECRET ?? "";

function signedHeaders(body: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", PLATFORM_API_SECRET)
    .update(body + timestamp)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "x-api-key": PLATFORM_API_KEY,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

async function fetchCurrentUserProfile(token: string): Promise<Record<string, unknown> | null> {
  const candidates = [
    "/marketplace/auth/me",
    "/auth/me",
    "/users/me",
    "/profile",
    "/me",
  ];

  for (const path of candidates) {
    try {
      const res = await fetch(`${MAIN_SITE_API}${path}`, {
        method: "GET",
        headers: platformHeaders({ Authorization: `Bearer ${token}` }),
        signal: AbortSignal.timeout(2500),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/json")) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const profile =
        (data.user as Record<string, unknown> | undefined) ??
        (data.profile as Record<string, unknown> | undefined) ??
        (data.client as Record<string, unknown> | undefined) ??
        data;
      if (profile && typeof profile === "object") return profile;
    } catch {
      // Optional profile enrichment only. Login must not fail if this endpoint
      // does not exist on the main app.
    }
  }

  return null;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  const body = await req.json() as Record<string, unknown>;
  const { action } = await context.params;

  try {
    // CLIENT users (USER/GUEST role) are rejected by /api/auth/login.
    // Route login through the marketplace endpoint which does a cross-tenant lookup.
    const isLogin = action === "login";
    const bodyStr = JSON.stringify(body);

    const url = isLogin
      ? `${MAIN_SITE_API}/marketplace/auth/login`
      : `${MAIN_SITE_API}/auth/${action}`;

    const headers = isLogin
      ? signedHeaders(bodyStr)
      : platformHeaders();

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      console.error("❌ Auth proxy: non-JSON response", res.status, await res.text());
      return NextResponse.json(
        { error: "Servis privremeno nedostupan. Pokušajte ponovo." },
        { status: 502 },
      );
    }

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const token = (data as { token?: string }).token;
    if (token && (data as { user?: unknown }).user) {
      const profile = await fetchCurrentUserProfile(token);
      if (profile) {
        (data as { user: Record<string, unknown> }).user = {
          ...((data as { user: Record<string, unknown> }).user ?? {}),
          ...profile,
        };
      }
    }

    const response = NextResponse.json(data);

    response.cookies.set("token", token ?? "", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      domain: "marysoll-assistant.website",
    });

    if ((data as { refreshToken?: string }).refreshToken) {
      response.cookies.set("refreshToken", (data as { refreshToken: string }).refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        domain: "marysoll-assistant.website",
      });
    }

    return response;
  } catch (error: unknown) {
    console.error("❌ Auth proxy error:", error);
    return NextResponse.json({ error: "Auth Proxy Error" }, { status: 500 });
  }
}
