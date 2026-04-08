import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function GET() {
  try {
    const clientId = required('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID);
    const redirectUri = required('GOOGLE_REDIRECT_URI', process.env.GOOGLE_REDIRECT_URI);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      redirectUri,
      scope: 'https://www.googleapis.com/auth/calendar.events',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build Google auth URL' },
      { status: 500 }
    );
  }
}
