// src/app/api/external/auth/[action]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authCookieOptions() {
  const configuredDomain =
    process.env.AUTH_COOKIE_DOMAIN ??
    (process.env.NODE_ENV === "production"
      ? "marysoll-assistant.website"
      : undefined);

  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(configuredDomain ? { domain: configuredDomain } : {}),
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  const body = await readJsonBody(req);
  const { action } = await context.params;

  try {
    // CLIENT users (USER/GUEST role) are rejected by /api/auth/login.
    // Route login through the marketplace endpoint which does a cross-tenant lookup.
    const isLogin = action === "login";
    const isRefresh = action === "refresh";
    const refreshToken =
      typeof body.refreshToken === "string"
        ? body.refreshToken
        : (await cookies()).get("refreshToken")?.value;

    if (isRefresh && !refreshToken) {
      return NextResponse.json(
        { error: "Nema aktivne sesije za osvežavanje prijave." },
        { status: 401 },
      );
    }

    const requestBody = isRefresh ? { ...body, refreshToken } : body;
    const bodyStr = JSON.stringify(requestBody);

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

    if (token) {
      response.cookies.set("token", token, authCookieOptions());
    }

    if ((data as { refreshToken?: string }).refreshToken) {
      response.cookies.set(
        "refreshToken",
        (data as { refreshToken: string }).refreshToken,
        authCookieOptions(),
      );
    }

    return response;
  } catch (error: unknown) {
    console.error("❌ Auth proxy error:", error);
    return NextResponse.json({ error: "Auth Proxy Error" }, { status: 500 });
  }
}
