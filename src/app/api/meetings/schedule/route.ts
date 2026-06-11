import { NextResponse } from 'next/server';
import { buildMeetingAnnouncement, normalizeMeetingInput } from '@/lib/meeting';

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
    const { description, calendarId = 'primary', attendees, reminders } = body || {};

    const {
      eventSummary,
      startDateTime,
      endDateTime,
      timeZone,
      reminderMinutes,
      resolvedLocation,
    } = normalizeMeetingInput(body || {});

    if (!eventSummary || !startDateTime || !endDateTime) {
      return NextResponse.json(
        { success: false, error: 'summary/title and a complete start/end time are required' },
        { status: 400 }
      );
    }

    const accessToken = await getGoogleAccessToken();

    const eventPayload: Record<string, unknown> = {
      summary: eventSummary,
      description: description || undefined,
      location: resolvedLocation,
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
    };

    if (Array.isArray(attendees) && attendees.length > 0) {
      eventPayload.attendees = attendees
        .filter((email: unknown) => typeof email === 'string' && email.trim())
        .map((email: string) => ({ email: email.trim() }));
    }

    if (Array.isArray(reminders) && reminders.length > 0) {
      eventPayload.reminders = {
        useDefault: false,
        overrides: reminders
          .filter((item: { minutes?: unknown; method?: unknown }) => item && Number.isFinite(Number(item?.minutes)))
          .map((item: { minutes: unknown; method?: unknown }) => ({ method: item?.method || 'popup', minutes: Number(item.minutes) })),
      };
    } else if (Number.isFinite(Number(reminderMinutes))) {
      eventPayload.reminders = {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: Number(reminderMinutes) }],
      };
    }

    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
        cache: 'no-store',
      }
    );

    const eventData = await eventRes.json();
    if (!eventRes.ok) {
      return NextResponse.json(
        { success: false, error: eventData?.error?.message || 'Failed to create Google Calendar event', raw: eventData },
        { status: 400 }
      );
    }

    const announcementText = buildMeetingAnnouncement({ ...body, summary: eventSummary, location: resolvedLocation });

    return NextResponse.json({
      success: true,
      event: {
        id: eventData.id,
        status: eventData.status,
        htmlLink: eventData.htmlLink,
        summary: eventData.summary,
        start: eventData.start,
        end: eventData.end,
      },
      announcementText,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to schedule meeting';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
