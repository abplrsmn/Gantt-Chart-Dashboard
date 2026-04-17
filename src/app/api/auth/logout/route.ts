import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function clearAuthCookie(response: NextResponse) {
  response.cookies.set('auth_token', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function GET() {
  return clearAuthCookie(NextResponse.json({ success: true, redirectTo: '/' }));
}

export async function POST() {
  return clearAuthCookie(NextResponse.json({ success: true, redirectTo: '/' }));
}
