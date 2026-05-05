import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

const AUTH_COOKIE_NAME = 'auth_token';

function verifyToken(token: string): { email?: string; role?: string; isAdmin?: boolean } | null {
  try {
    const secret = process.env.AUTH_SECRET;
    const dot = token.lastIndexOf('.');
    if (!secret || dot === -1) return null;
    const b64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(b64).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Pages each role is ALLOWED to access (prefix match)
const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  admin: ['/dashboard'], // admin can access everything under /dashboard
  pm: ['/dashboard/capex-gantt', '/dashboard/projects'], // pm can access Gantt and Projects
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

  const decoded = verifyToken(authCookie.value);
  if (!decoded?.email) {
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
