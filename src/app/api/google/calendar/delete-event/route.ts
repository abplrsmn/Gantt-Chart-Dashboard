import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function getGoogleAccessToken() {
  const clientId = required('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID);
  const clientSecret = required('GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = required('GOOGLE_REFRESH_TOKEN', process.env.GOOGLE_REFRESH_TOKEN);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    cache: 'no-store',
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData?.error_description || tokenData?.error || 'Failed to refresh Google access token');
  }

  return tokenData.access_token as string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventId = body?.eventId;
    const calendarId = body?.calendarId || 'primary';

    if (!eventId) {
      return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 });
    }

    const accessToken = await getGoogleAccessToken();

    const deleteRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      }
    );

    if (!deleteRes.ok) {
      const raw = await deleteRes.text();
      return NextResponse.json(
        { success: false, error: 'Failed to delete Google Calendar event', raw },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, eventId, calendarId });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete Google Calendar event' },
      { status: 500 }
    );
  }
}
