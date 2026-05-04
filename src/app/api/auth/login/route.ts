import { NextResponse } from 'next/server';
import { authenticateUser, createAuthCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid credentials. Please check your email and password.' }, { status: 401 });
    }

    await createAuthCookie(user);
    return NextResponse.json({ success: true, user: { email: user.email, isAdmin: user.isAdmin, role: user.role, fullName: user.fullName } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Login failed.' }, { status: 500 });
  }
}
