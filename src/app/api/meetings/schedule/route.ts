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

async function getClickUpAccess() {
  const token = required('CLICKUP_API_TOKEN', process.env.CLICKUP_API_TOKEN).trim().replace(/^['"]|['"]$/g, '');
  const workspaceId = required('CLICKUP_TEAM_ID', process.env.CLICKUP_TEAM_ID).trim().replace(/^['"]|['"]$/g, '');
  return { token, workspaceId };
}

async function resolveClickUpChannelId(teamName: string, token: string, workspaceId: string) {
  const res = await fetch(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/chat/channels`, {
    headers: { Authorization: token },
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.err || data?.error || 'Failed to list ClickUp chat channels');
  }

  const normalizedTeam = teamName.trim().toLowerCase();
  const channels = Array.isArray(data?.data) ? data.data : [];

  const match = channels.find((channel: any) => {
    const name = String(channel?.name || '').trim().toLowerCase();
    return name === normalizedTeam || name.includes(normalizedTeam);
  });

  return match?.id || null;
}

async function postClickUpChannelMessage(channelId: string, content: string, token: string, workspaceId: string) {
  const res = await fetch(`https://api.clickup.com/api/v3/workspaces/${workspaceId}/chat/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.err || data?.error || 'Failed to send ClickUp chat message');
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      description,
      calendarId = 'primary',
      attendees,
      reminders,
      announce = false,
      team,
      channelTarget,
    } = body || {};

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

    const eventPayload: any = {
      summary: eventSummary,
      description: description || undefined,
      location: resolvedLocation,
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
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
          .filter((item: any) => item && Number.isFinite(Number(item?.minutes)))
          .map((item: any) => ({ method: item?.method || 'popup', minutes: Number(item.minutes) })),
      };
    } else if (Number.isFinite(Number(reminderMinutes))) {
      eventPayload.reminders = {
        useDefault: false,
        overrides: [
          {
            method: 'popup',
            minutes: Number(reminderMinutes),
          },
        ],
      };
    }

    const eventRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
      cache: 'no-store',
    });

    const eventData = await eventRes.json();

    if (!eventRes.ok) {
      return NextResponse.json(
        { success: false, error: eventData?.error?.message || 'Failed to create Google Calendar event', raw: eventData },
        { status: 400 }
      );
    }

    let announcement = null;
    let resolvedChannelId = channelTarget || null;

    if (announce && (team || channelTarget)) {
      const { token, workspaceId } = await getClickUpAccess();
      if (!resolvedChannelId && team) {
        resolvedChannelId = await resolveClickUpChannelId(team, token, workspaceId);
      }

      if (resolvedChannelId) {
        const content = buildMeetingAnnouncement({
          ...body,
          summary: eventSummary,
          location: resolvedLocation,
        });
        announcement = await postClickUpChannelMessage(resolvedChannelId, content, token, workspaceId);
      }
    }

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
      announcement: announcement
        ? {
            posted: true,
            channelId: resolvedChannelId,
          }
        : {
            posted: false,
            channelId: resolvedChannelId,
          },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to schedule meeting' },
      { status: 500 }
    );
  }
}
