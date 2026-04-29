import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  await clearAuthCookie();
  return NextResponse.json({ success: true, redirectTo: '/' });
}

export async function POST() {
  await clearAuthCookie();
  return NextResponse.json({ success: true, redirectTo: '/' });
}
