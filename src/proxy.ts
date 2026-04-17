import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This function can be marked `async` if using `await` inside
export function proxy(request: NextRequest) {
  // Assume everything under /dashboard requires authentication
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    const authCookie = request.cookies.get("auth_token");

    // If no valid auth cookie, redirect them to the root login page
    if (!authCookie || authCookie.value !== "supersecret_dev_token") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Allow the request to pass through by default
  return NextResponse.next();
}

// Specify the paths this middleware should run on
export const config = {
  matcher: ["/dashboard/:path*"],
};
