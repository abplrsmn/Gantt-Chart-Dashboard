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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const calendarId = url.searchParams.get('calendarId') || 'primary';
    const timeMin = url.searchParams.get('timeMin');
    const timeMax = url.searchParams.get('timeMax');
    const query = url.searchParams.get('q') || '';
    const maxResults = url.searchParams.get('maxResults') || '20';
    const showDeleted = url.searchParams.get('showDeleted') || 'false';

    const accessToken = await getGoogleAccessToken();
    const googleUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    googleUrl.searchParams.set('singleEvents', 'true');
    googleUrl.searchParams.set('orderBy', 'startTime');
    googleUrl.searchParams.set('maxResults', maxResults);
    googleUrl.searchParams.set('showDeleted', showDeleted);
    if (timeMin) googleUrl.searchParams.set('timeMin', timeMin);
    if (timeMax) googleUrl.searchParams.set('timeMax', timeMax);
    if (query) googleUrl.searchParams.set('q', query);

    const eventRes = await fetch(googleUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    const eventData = await eventRes.json();

    if (!eventRes.ok) {
      return NextResponse.json(
        { success: false, error: eventData?.error?.message || 'Failed to list Google Calendar events', raw: eventData },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      events: (eventData.items || []).map((event: any) => ({
        id: event.id,
        summary: event.summary,
        status: event.status,
        htmlLink: event.htmlLink,
        recurringEventId: event.recurringEventId,
        start: event.start,
        end: event.end,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list Google Calendar events' },
      { status: 500 }
    );
  }
}
