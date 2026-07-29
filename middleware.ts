import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getToken } from 'next-auth/jwt';

export const runtime = 'nodejs';

const AUTH_COOKIE_NAME = 'auth_token';

const PROTECTED_API_PREFIXES = [
  '/api/ai-telemetry',
  '/api/audit',
  '/api/capex',
  '/api/chat',
  '/api/gchat/notify',
  '/api/google/calendar',
  '/api/google/oauth/start',
  '/api/master',
  '/api/meetings',
  '/api/ops',
  '/api/projects',
  '/api/team',
  '/api/reminder-logs',
];

function verifyToken(token: string): { email?: string } | null {
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

async function hasGoogleSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const secureCookie = forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
    const token = await getToken({ req: request, secret, secureCookie });
    return typeof token?.email === 'string';
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const protectsDashboard = pathname.startsWith('/dashboard');
  const protectsApi = isProtectedApiPath(pathname);

  if (!protectsDashboard && !protectsApi) {
    return NextResponse.next();
  }

  // --- Auth check ---
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const decoded = token ? verifyToken(token) : null;
  const googleSession = decoded ? false : await hasGoogleSession(request);

  if (!decoded?.email && !googleSession) {
    if (protectsApi) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
