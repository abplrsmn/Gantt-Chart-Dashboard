import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return forwardedProto === 'https' || new URL(request.url).protocol === 'https:';
}

export async function POST(request: Request) {
  await clearAuthCookie({ secure: isSecureRequest(request) });
  return NextResponse.json({ success: true, redirectTo: '/' });
}
