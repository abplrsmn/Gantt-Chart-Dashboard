import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_token';

// Pages each role is ALLOWED to access (prefix match)
const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  admin: ['/dashboard'], // admin can access everything under /dashboard
  pm: ['/dashboard/capex-gantt'], // pm can ONLY access the Gantt chart
};

// Default landing page per role after login
const ROLE_DEFAULT_PAGE: Record<string, string> = {
  admin: '/dashboard',
  pm: '/dashboard/capex-gantt',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  // --- Auth check ---
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!authCookie?.value) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let decoded: { email?: string; role?: string; isAdmin?: boolean } | null = null;
  try {
    decoded = JSON.parse(Buffer.from(authCookie.value, 'base64url').toString('utf8'));
    if (!decoded?.email) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // --- Role-based access check ---
  const role = typeof decoded.role === 'string' ? decoded.role : (decoded.isAdmin ? 'admin' : 'pm');
  const allowedPaths = ROLE_ALLOWED_PATHS[role] ?? [];

  const isAllowed = allowedPaths.some((allowed) =>
    pathname === allowed || pathname.startsWith(allowed + '/')
  );

  if (!isAllowed) {
    // Redirect to their default landing page
    const fallback = ROLE_DEFAULT_PAGE[role] ?? '/dashboard/capex-gantt';
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
