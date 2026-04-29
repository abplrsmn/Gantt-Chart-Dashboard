import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_token';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
    if (!authCookie?.value) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const decoded = JSON.parse(Buffer.from(authCookie.value, 'base64url').toString('utf8'));
      if (!decoded?.email) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
