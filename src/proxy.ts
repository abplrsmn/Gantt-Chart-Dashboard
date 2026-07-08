import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "auth_token";

const PROTECTED_API_PREFIXES = [
  "/api/capex",
  "/api/gchat/notify",
  "/api/google/calendar",
  "/api/google/oauth/start",
  "/api/meetings",
  "/api/ops",
  "/api/projects",
  "/api/reminder-logs",
];

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// NextAuth v5 session cookie names
const NEXTAUTH_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasNextAuthSession(request: NextRequest): boolean {
  return NEXTAUTH_COOKIE_NAMES.some(name => !!request.cookies.get(name)?.value);
}

async function isValidAuthToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const signatureHex = token.slice(dot + 1);
  const signatureBytes = hexToBytes(signatureHex);
  if (!payload || !signatureBytes) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
    if (!timingSafeEqual(signatureBytes, expected)) return false;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return !!parsed && typeof parsed.email === "string";
  } catch {
    return false;
  }
}

function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = pathname.startsWith("/dashboard") || isProtectedApiPath(pathname);

  if (!needsAuth) return NextResponse.next();

  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthed = await isValidAuthToken(authCookie) || hasNextAuthSession(request);

  if (!isAuthed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // PM users can only access /dashboard/projects/*
  // (Google SSO users without user_role cookie are treated as pm until session enriches)
  if (pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/projects")) {
    const role = request.cookies.get("user_role")?.value;
    if (role === "pm") {
      return NextResponse.redirect(new URL("/dashboard/projects/gantt", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
