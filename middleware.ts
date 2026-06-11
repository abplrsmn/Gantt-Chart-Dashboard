import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

const AUTH_COOKIE_NAME = 'auth_token';

const PROTECTED_API_PREFIXES = [
  '/api/ai-telemetry',
  '/api/capex',
  '/api/gchat/notify',
  '/api/google/calendar',
  '/api/google/oauth/start',
  '/api/meetings',
  '/api/ops',
  '/api/projects',
  '/api/reminder-logs',
];

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
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return parsed && typeof parsed.email === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Pages each role is ALLOWED to access (prefix match)
const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  admin: ['/dashboard'], // admin can access everything under /dashboard
  pm: [
    '/dashboard/projects',    // Gantt, list, detail, weekly-progress, audit
    '/dashboard/weekly-report',
    '/dashboard/alerts',
  ],
};

// Default landing page per role after login
const ROLE_DEFAULT_PAGE: Record<string, string> = {
  admin: '/dashboard',
  pm: '/dashboard/projects/gantt',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const protectsDashboard = pathname.startsWith('/dashboard');
  const protectsApi = isProtectedApiPath(pathname);

  if (!protectsDashboard && !protectsApi) {
    return NextResponse.next();
  }

  // --- Auth check ---
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const decoded = token ? verifyToken(token) : null;

  if (!decoded?.email) {
    if (protectsApi) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // API auth only; route-level API handlers can add stricter role checks if needed.
  if (protectsApi) {
    return NextResponse.next();
  }

  // --- Role-based dashboard page access check ---
  // Always derive from isAdmin so stale tokens without 'role' are handled correctly.
  const role = decoded.isAdmin ? 'admin' : 'pm';
  const allowedPaths = ROLE_ALLOWED_PATHS[role] ?? [];

  const isAllowed = allowedPaths.some((allowed) =>
    pathname === allowed || pathname.startsWith(allowed + '/')
  );

  if (!isAllowed) {
    // Redirect to their default landing page
    const fallback = ROLE_DEFAULT_PAGE[role] ?? '/dashboard/projects/gantt';
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
