export type ParsedIntent = {
  intent: 'meeting' | 'task' | 'project' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  fields: Record<string, unknown>;
  missingCritical: string[];
  shouldExecute: boolean;
  followUpQuestion?: string;
};

export type ParsedOpsCommand = {
  commandType: 'TASK' | 'PROJECT';
  fields: Record<string, string>;
  originalText: string;
};

const TEAM_HINTS = ['idea tech', 'tech', 'data & digital', 'data and digital', 'data', 'digital', 'marketing', 'finance', 'hr'];
const WEEKDAY_MAP: Record<string, number> = {
  minggu: 0,
  sunday: 0,
  senin: 1,
  monday: 1,
  selasa: 2,
  tuesday: 2,
  rabu: 3,
  wednesday: 3,
  kamis: 4,
  thursday: 4,
  jumat: 5,
  friday: 5,
  sabtu: 6,
  saturday: 6,
};

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function normalizeCommandKey(key: string) {
  return key.toLowerCase().trim().replace(/\s+/g, '_');
}

function parsePipeFields(text: string, commandType: 'TASK' | 'PROJECT') {
  const upper = text.toUpperCase();
  const marker = `${commandType} |`;
  const markerIndex = upper.indexOf(marker);
  if (markerIndex < 0) return null;

  const cleaned = text
    .slice(markerIndex)
    .replace(/```/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  if (!cleaned.toUpperCase().startsWith(marker)) return null;

  const rawPairs = cleaned.split('|').slice(1);
  const fields: Record<string, string> = {};

  for (const pair of rawPairs) {
    const match = pair.match(/^\s*([A-Za-z0-9 _-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = normalizeCommandKey(match[1]);
    const value = match[2].trim();
    if (!value) continue;
    if (key === 'title' && /^task\s*$/i.test(value)) continue;
    if (key === 'title' && /^project\s*$/i.test(value)) continue;
    fields[key] = value;
  }

  return fields;
}

function parseKeyValueBlock(text: string) {
  const fields: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-•*]\s*)?([A-Za-z][A-Za-z0-9 _/&()-]+?)\s*[:=]\s*(.+?)\s*$/);
    if (!match) continue;
    const key = normalizeCommandKey(match[1]);
    const value = match[2].trim();
    if (!value) continue;
    fields[key] = value;
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

export function parseStructuredOpsCommand(text: string): ParsedOpsCommand | null {
  const projectFields = parsePipeFields(text, 'PROJECT');
  if (projectFields) {
    return {
      commandType: 'PROJECT',
      fields: projectFields,
      originalText: text,
    };
  }

  const taskFields = parsePipeFields(text, 'TASK');
  if (taskFields) {
    return {
      commandType: 'TASK',
      fields: taskFields,
      originalText: text,
    };
  }

  const blockFields = parseKeyValueBlock(text);
  if (blockFields) {
    const hasProjectSignals = !!(blockFields.unit || blockFields.project || blockFields.commence_date || blockFields.end_contract || blockFields.budget_capex || blockFields.contract_amount);
    const hasTaskSignals = !!(blockFields.folder || blockFields.team || blockFields.list || blockFields.title || blockFields.deadline || blockFields.description || blockFields.desc);

    if (hasProjectSignals && !hasTaskSignals) {
      return {
        commandType: 'PROJECT',
        fields: blockFields,
        originalText: text,
      };
    }

    if (hasTaskSignals) {
      return {
        commandType: 'TASK',
        fields: blockFields,
        originalText: text,
      };
    }
  }

  return null;
}

function todayInJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextWeekday(targetDay: number) {
  const today = todayInJakarta();
  const d = new Date(`${today}T00:00:00+07:00`);
  const currentDay = d.getUTCDay();
  let delta = targetDay - currentDay;
  if (delta <= 0) delta += 7;
  return addDays(today, delta);
}

function extractTeam(text: string) {
  const lowered = normalize(text);
  const found = TEAM_HINTS.find((team) => lowered.includes(team)) || null;
  if (!found) return null;
  if (found === 'idea tech' || found === 'tech') return 'tech';
  if (found === 'data & digital' || found === 'data and digital' || found === 'data' || found === 'digital') return 'data & digital';
  return found;
}

function extractDate(text: string) {
  const lowered = normalize(text);
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const named = lowered.match(/\b(\d{1,2})\s+(januari|january|februari|february|maret|march|april|mei|may|juni|june|juli|july|agustus|august|september|oktober|october|november|desember|december)\s+(20\d{2})(?:\s*,?\s*(\d{1,2})(?::|\.)(\d{2}))?\b/);
  if (named) {
    const months: Record<string, string> = {
      januari: '01', january: '01', februari: '02', february: '02', maret: '03', march: '03',
      april: '04', mei: '05', may: '05', juni: '06', june: '06', juli: '07', july: '07',
      agustus: '08', august: '08', september: '09', oktober: '10', october: '10',
      november: '11', desember: '12', december: '12',
    };
    return `${named[3]}-${months[named[2]]}-${named[1].padStart(2, '0')}`;
  }

  const today = todayInJakarta();
  if (lowered.includes('hari ini') || lowered.includes('today')) return today;
  if (lowered.includes('besok') || lowered.includes('tomorrow')) return addDays(today, 1);
  if (lowered.includes('lusa')) return addDays(today, 2);

  for (const [weekday, dayNumber] of Object.entries(WEEKDAY_MAP)) {
    const pattern = new RegExp(`\\b${weekday}\\b`, 'i');
    if (pattern.test(lowered)) return nextWeekday(dayNumber);
  }

  return null;
}

function extractTime(text: string) {
  const explicit = text.match(/\b(?:time|jam mulai|mulai|deadline|due|jam)\s*[:=]?\s*(\d{1,2})(?::|\.)(\d{2})\b/i);
  if (explicit) return `${explicit[1].padStart(2, '0')}:${explicit[2]}`;

  const m = text.match(/\b(\d{1,2})(?::|\.)(\d{2})\b/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

  const noon = text.match(/\bjam\s*(\d{1,2})\s*(siang|pagi|malam|sore)?\b/i);
  if (noon) {
    let hour = Number(noon[1]);
    const marker = (noon[2] || '').toLowerCase();
    if ((marker === 'siang' || marker === 'sore' || marker === 'malam') && hour < 12) hour += 12;
    return `${String(hour).padStart(2, '0')}:00`;
  }

  if (/nanti sore/i.test(text)) return '16:00';
  if (/nanti malam/i.test(text)) return '19:00';
  if (/nanti pagi/i.test(text)) return '09:00';

  return null;
}

function extractDurationMinutes(text: string) {
  const lowered = normalize(text);
  if (lowered.includes('remind') || lowered.includes('ingatkan') || lowered.includes('reminder')) {
    return null;
  }
  const mins = lowered.match(/\b(\d{1,3})\s*menit\b/);
  if (mins) return Number(mins[1]);
  const hours = lowered.match(/\b(\d{1,2})\s*jam\b/);
  if (hours) return Number(hours[1]) * 60;
  return null;
}

function extractMeetLink(text: string) {
  const m = text.match(/https?:\/\/meet\.google\.com\/[A-Za-z0-9\-]+/i);
  return m ? m[0] : null;
}

function detectIntent(text: string): 'meeting' | 'task' | 'unknown' {
  const lowered = normalize(text);
  const meetingSignals = ['meeting', 'meet', 'schedule', 'jadwal', 'gmeet', 'google meet', 'sync'];
  const taskSignals = [
    'task', 'assign', 'deadline', 'due', 'follow up', 'todo',
    'buatin task', 'buat task', 'bikinin task', 'tolong buat', 'tolong bikin',
    'kerjain', 'tolong kerjain', 'please handle', 'please fix', 'fix', 'cek', 'followup',
    'folder:', 'list:', 'title:', 'description:', 'deadline:'
  ];

  const meetingHit = meetingSignals.some((signal) => lowered.includes(signal));
  const taskHit = taskSignals.some((signal) => lowered.includes(signal));

  if (taskHit) return 'task';
  if (meetingHit) return 'meeting';
  return 'unknown';
}

function extractLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(`(?:^|\\n|•|-)\\s*${label}\\s*[:=]\\s*(.+)`, 'im');
    const match = text.match(regex);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractAssignee(text: string) {
  const labeled = extractLabeledValue(text, ['assign', 'assignee', 'pic', 'owner', 'pic name']);
  if (labeled) return labeled.replace(/^@/, '').trim();

  const patterns = [
    /assign\s+ke\s+@?([A-Za-z0-9._\- ]+?)(?:\n|\s+(?:deadline|due|note|desc|description|buat|bikin|untuk|team|tim)\b|$)/i,
    /assign\s+@?([A-Za-z0-9._\- ]+?)(?:\n|\s+(?:deadline|due|note|desc|description|buat|bikin|untuk|team|tim)\b|$)/i,
    /pic\s+(?:nya\s+)?@?([A-Za-z0-9._\- ]+?)(?:\n|\s+(?:deadline|due|note|desc|description|buat|bikin|untuk|team|tim)\b|$)/i,
    /owner\s+(?:nya\s+)?@?([A-Za-z0-9._\- ]+?)(?:\n|\s+(?:deadline|due|note|desc|description|buat|bikin|untuk|team|tim)\b|$)/i,
    /untuk\s+@([A-Za-z0-9._\-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/^@/, '').trim();
  }

  return null;
}

function cleanTaskTitle(raw: string) {
  const withoutCommand = raw
    .replace(/^\s*TASK\s*\|?/i, '')
    .replace(/^\s*PROJECT\s*\|?/i, '')
    .replace(/@mr_palgudbot/ig, '')
    .replace(/assign task/ig, '')
    .replace(/buat(?:in)?\s+task/ig, '')
    .replace(/bikin(?:in)?\s+task/ig, '')
    .replace(/tolong\s+/ig, '')
    .replace(/please\s+/ig, '')
    .replace(/assign\s*(?:ke)?\s*[A-Za-z0-9@._\- ]+/ig, '')
    .replace(/deadline\s*[:=]?.*/ig, '')
    .replace(/due\s*[:=]?.*/ig, '')
    .replace(/desc\s*[:=]?.*/ig, '')
    .replace(/description\s*[:=]?.*/ig, '')
    .replace(/title\s*[:=]?.*/ig, '')
    .trim();

  return withoutCommand.replace(/^\|\s*/, '').trim();
}

function inferTaskTitleFromNatural(text: string) {
  const patterns = [
    /(?:tolong\s+)?(?:buat|bikin)(?:in)?\s+task\s+(?:buat|untuk)?\s*(?:tim\s+|team\s+)?(?:tech|data(?:\s*&\s*digital)?|digital|marketing|finance|hr)?\s*[:,\-]?\s*(.+)$/i,
    /(?:tolong\s+)?(?:buat|bikin)(?:in)?\s+(.+?)\s+(?:assign\s+ke|deadline|due|untuk\s+tim|buat\s+tim|for\s+team|$)/i,
    /(?:tolong\s+)?(?:kerjain|cek|fix|follow\s*up|followup)\s+(.+?)(?:\s+(?:assign\s+ke|deadline|due|untuk\s+tim|buat\s+tim)|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanTaskTitle(match[1]);
  }

  return '';
}

export function parseOpsIntent(text: string): ParsedIntent {
  const structured = parseStructuredOpsCommand(text);

  if (structured?.commandType === 'PROJECT') {
    const fields = structured.fields;
    const title = fields.title || fields.project || fields.task || fields.name || '';
    const missingCritical = [!title ? 'title' : null].filter(Boolean) as string[];

    return {
      intent: 'project',
      confidence: missingCritical.length === 0 ? 'high' : 'medium',
      fields: {
        ...fields,
        title,
        team: fields.team || null,
        folder: fields.folder || null,
        list: fields.list || null,
        space: fields.space || null,
        unit: fields.unit || null,
        dueDateHint: fields.end || fields.due || null,
        assignee: fields.pic || fields.assignee || fields.assign || null,
      },
      missingCritical,
      shouldExecute: missingCritical.length === 0,
      followUpQuestion: missingCritical.length > 0 ? 'Judul project/task-nya apa?' : undefined,
    };
  }

  const intent = structured?.commandType === 'TASK' ? 'task' : detectIntent(text);

  if (intent === 'meeting') {
    const title = extractLabeledValue(text, ['title', 'summary', 'topic', 'topik']) || text.trim();
    const team = extractTeam(text);
    const date = extractDate(text);
    const time = extractTime(text);
    const durationMinutes = extractDurationMinutes(text);
    const meetLink = extractMeetLink(text);

    const missingCritical = [
      !date ? 'date' : null,
      !time ? 'time' : null,
    ].filter(Boolean) as string[];

    const shouldExecute = missingCritical.length === 0;

    return {
      intent,
      confidence: shouldExecute ? 'high' : 'medium',
      fields: {
        title,
        team,
        date,
        time,
        durationMinutes,
        meetLink,
        timeZone: 'Asia/Jakarta',
      },
      missingCritical,
      shouldExecute,
      followUpQuestion: shouldExecute
        ? undefined
        : !date
        ? 'Tanggal meetingnya kapan?'
        : !time
        ? 'Jam meetingnya jam berapa?'
        : undefined,
    };
  }

  if (intent === 'task') {
    const commandFields = structured?.commandType === 'TASK' ? structured.fields : null;
    const explicitTeam = extractLabeledValue(text, ['team', 'tim', 'folder']);
    const explicitFolder = extractLabeledValue(text, ['folder']);
    const explicitList = extractLabeledValue(text, ['list']);
    const explicitSpace = extractLabeledValue(text, ['space', 'workspace']);
    const team =
      commandFields?.team ||
      commandFields?.folder ||
      (explicitTeam ? explicitTeam.toLowerCase() : extractTeam(text));
    const dueFromLabel = extractLabeledValue(text, ['deadline', 'due']);
    const title = extractLabeledValue(text, ['title', 'task', 'nama task']);
    const description = extractLabeledValue(text, ['desc', 'description', 'notes', 'note']);
    const assignee = extractAssignee(text);

    const dueDateHint = commandFields?.due || commandFields?.deadline || commandFields?.end || dueFromLabel || (() => {
      const date = extractDate(text);
      const time = extractTime(text);
      if (date && time) return `${date} ${time}`;
      return date;
    })();

    let taskTitle = commandFields?.title || commandFields?.task || commandFields?.name || title || inferTaskTitleFromNatural(text) || cleanTaskTitle(text);
    if (typeof taskTitle === 'string') {
      taskTitle = taskTitle.replace(/^\s*TASK\s*\|?/i, '').trim();
      taskTitle = taskTitle.replace(/^\s*PROJECT\s*\|?/i, '').trim();
    }
    if (!taskTitle && description) taskTitle = description;
    if (typeof taskTitle === 'string') {
      taskTitle = taskTitle.replace(/^\s*TASK\s*\|?/i, '').replace(/^\s*PROJECT\s*\|?/i, '').trim();
      if (/^task\s*\|?$/i.test(taskTitle) || /^project\s*\|?$/i.test(taskTitle)) {
        taskTitle = '';
      }
    }

    const explicitDescription = commandFields?.description || commandFields?.desc || commandFields?.note || commandFields?.notes;
    const assigneeFromCommand = commandFields?.assignee || commandFields?.assign || commandFields?.pic;
    const explicitUnit = commandFields?.unit || null;

    const normalizedTeam = team === 'tech' ? 'tech' : team === 'data & digital' ? 'data & digital' : team;

    const missingCritical = [
      !taskTitle ? 'taskTitle' : null,
    ].filter(Boolean) as string[];

    return {
      intent,
      confidence: missingCritical.length === 0 ? 'high' : 'medium',
      fields: {
        rawText: text,
        team: normalizedTeam,
        folder: commandFields?.folder || explicitFolder || normalizedTeam,
        list: commandFields?.list || explicitList,
        space: commandFields?.space || explicitSpace,
        unit: explicitUnit,
        dueDateHint,
        assignee: (assigneeFromCommand || assignee || '').trim() || null,
        taskTitle,
        description: explicitDescription || description,
      },
      missingCritical,
      shouldExecute: missingCritical.length === 0,
      followUpQuestion: !taskTitle ? 'Nama task-nya apa?' : undefined,
    };
  }

  return {
    intent: 'unknown',
    confidence: 'low',
    fields: { rawText: text },
    missingCritical: [],
    shouldExecute: false,
    followUpQuestion: 'Mau schedule meeting atau create task?',
  };
}
