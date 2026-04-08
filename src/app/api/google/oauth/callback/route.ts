import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ success: false, error: 'Missing code' }, { status: 400 });
    }

    const clientId = required('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID);
    const clientSecret = required('GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET);
    const redirectUri = required('GOOGLE_REDIRECT_URI', process.env.GOOGLE_REDIRECT_URI);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      cache: 'no-store',
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return NextResponse.json(
        { success: false, error: tokenData?.error_description || tokenData?.error || 'Token exchange failed', raw: tokenData },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Google OAuth connected. Save the refresh_token securely before production hardening.',
      tokens: tokenData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Google OAuth callback failed' },
      { status: 500 }
    );
  }
}
