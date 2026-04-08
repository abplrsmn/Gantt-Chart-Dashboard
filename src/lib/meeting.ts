export type MeetingInput = {
  summary?: string;
  title?: string;
  description?: string;
  location?: string;
  meetLink?: string;
  start?: string;
  end?: string;
  date?: string;
  time?: string;
  endTime?: string;
  durationMinutes?: number;
  timeZone?: string;
  calendarId?: string;
  attendees?: string[];
  reminderMinutes?: number;
  reminderTime?: string;
  reminders?: Array<{ method?: string; minutes: number }>;
  team?: string;
  channelTarget?: string;
};

export function toOffsetForTimeZone(timeZone: string) {
  if (timeZone === 'Asia/Jakarta') return '+07:00';
  return 'Z';
}

export function buildDateTime(date: string, time: string, timeZone: string) {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalizedTime}${toOffsetForTimeZone(timeZone)}`;
}

export function computeReminderMinutes(startDateTime: string, date?: string, reminderTime?: string) {
  if (!date || !reminderTime) return null;
  const startMs = new Date(startDateTime).getTime();
  const reminderMs = new Date(buildDateTime(date, reminderTime, 'Asia/Jakarta')).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(reminderMs)) return null;

  const minutes = Math.round((startMs - reminderMs) / 60000);
  if (minutes < 0) return null;
  return minutes;
}

export function normalizeMeetingInput(body: MeetingInput) {
  const timeZone = body.timeZone || 'Asia/Jakarta';
  const eventSummary = body.summary || body.title;

  let startDateTime = body.start;
  let endDateTime = body.end;

  if (!startDateTime && body.date && body.time) {
    startDateTime = buildDateTime(body.date, body.time, timeZone);
  }

  if (!endDateTime && body.date && body.endTime) {
    endDateTime = buildDateTime(body.date, body.endTime, timeZone);
  }

  if (!endDateTime && startDateTime && body.durationMinutes) {
    const startMs = new Date(startDateTime).getTime();
    if (!Number.isNaN(startMs)) {
      endDateTime = new Date(startMs + Number(body.durationMinutes) * 60000).toISOString();
    }
  }

  let derivedReminderMinutes: number | null = null;
  if (startDateTime && body.date && body.reminderTime) {
    derivedReminderMinutes = computeReminderMinutes(startDateTime, body.date, body.reminderTime);
  }

  return {
    eventSummary,
    startDateTime,
    endDateTime,
    timeZone,
    reminderMinutes:
      derivedReminderMinutes ??
      (Number.isFinite(Number(body.reminderMinutes)) ? Number(body.reminderMinutes) : null),
    resolvedLocation: body.meetLink || body.location || undefined,
  };
}

export function buildMeetingAnnouncement(body: MeetingInput) {
  const title = body.summary || body.title || 'Meeting';
  const lines = [
    `📅 ${title}`,
    body.date ? `Date: ${body.date}` : null,
    body.time ? `Time: ${body.time}${body.endTime ? ` - ${body.endTime}` : body.durationMinutes ? ` (${body.durationMinutes} min)` : ''}` : null,
    `Timezone: ${body.timeZone || 'Asia/Jakarta'}`,
    body.meetLink || body.location ? `Meet: ${body.meetLink || body.location}` : null,
    body.description ? `Notes: ${body.description}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}
