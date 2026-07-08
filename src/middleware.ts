import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth(function middleware(req) {
  const isProtected = req.nextUrl.pathname.startsWith("/dashboard")
  if (!isProtected) return NextResponse.next()

  // Google SSO session (NextAuth)
  if (req.auth) return NextResponse.next()

  // Legacy email/password cookie — existence check only (HMAC validated per-request in API routes)
  if (req.cookies.get("auth_token")?.value) return NextResponse.next()

  return NextResponse.redirect(new URL("/", req.nextUrl))
})

export const config = {
  matcher: ["/dashboard/:path*"],
}
