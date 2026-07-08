import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const base = process.env.AUTH_URL ?? new URL(request.url).origin
  // Proxy handles auth check — redirect to dashboard, it will bounce to / if session invalid
  return NextResponse.redirect(new URL("/dashboard", base))
}
