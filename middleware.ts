import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_VALUE = 'supersecret_dev_token';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const authCookie = request.cookies.get(AUTH_COOKIE_NAME);

    if (!authCookie || authCookie.value !== AUTH_COOKIE_VALUE) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
