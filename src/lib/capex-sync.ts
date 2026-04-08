import { capexSeedRows, type CapexSeedRow } from '@/lib/capex-seed';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function pad2(value: string | number) {
  return String(value).padStart(2, '0');
}

function normalizeDateInput(input?: string) {
  if (!input) return null;
  const text = input.trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const lowered = text.toLowerCase();
  const monthMap: Record<string, string> = {
    januari: '01', january: '01', februari: '02', february: '02', maret: '03', march: '03', april: '04',
    mei: '05', may: '05', juni: '06', june: '06', juli: '07', july: '07', agustus: '08', august: '08',
    september: '09', oktober: '10', october: '10', november: '11', desember: '12', december: '12',
  };

  const named = lowered.match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/i);
  if (named) {
    const month = monthMap[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${pad2(named[1])}`;
  }
  return null;
}

function normalizeDateTimeToJakartaMs(input?: string) {
  if (!input) return undefined;
  const justDate = normalizeDateInput(input);
  if (!justDate) return undefined;
  return new Date(`${justDate}T23:59:00+07:00`).getTime();
}

async function fetchClickUp(url: string, init?: RequestInit) {
  required('CLICKUP_API_TOKEN', API_TOKEN);
  required('CLICKUP_TEAM_ID', TEAM_ID);

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: API_TOKEN,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.err || data?.error || `ClickUp API error ${response.status}`);
  }

  return data;
}

async function resolveTargetList() {
  const spacesData = await fetchClickUp(`${API_BASE_URL}/team/${TEAM_ID}/space`);
  const spaces = spacesData?.spaces || [];
  const targetSpace = spaces.find((space: any) => String(space?.name || '').trim().toLowerCase() === TARGET_SPACE_NAME.toLowerCase());
  if (!targetSpace) throw new Error(`Target space not found: ${TARGET_SPACE_NAME}`);

  const listsData = await fetchClickUp(`${API_BASE_URL}/space/${targetSpace.id}/list`);
  const lists = Array.isArray(listsData?.lists) ? listsData.lists : [];

  const targetList = lists.find((list: any) => String(list?.name || '').trim().toLowerCase() === TARGET_LIST_NAME.toLowerCase());
  if (!targetList) throw new Error(`Target list not found: ${TARGET_LIST_NAME}`);

  return {
    spaceId: String(targetSpace.id),
    listId: String(targetList.id),
    spaceName: String(targetSpace.name),
    listName: String(targetList.name),
  };
}

function buildDescription(row: CapexSeedRow) {
  const lines = [
    `Source Key: ${row.sourceKey}`,
    `Unit: ${row.unit}`,
    row.start ? `Start: ${row.start}` : null,
    row.end ? `End: ${row.end}` : null,
    `Status: ${row.status}`,
    row.progress !== undefined ? `Progress: ${row.progress}%` : null,
    row.pic ? `PIC: ${row.pic}` : null,
    row.note ? `Status Note: ${row.note}` : null,
    row.nextAction ? `Next Action: ${row.nextAction}` : null,
    'Managed by CAPEX sync pipeline',
  ].filter(Boolean);

  return lines.join('\n');
}

function buildTag(row: CapexSeedRow) {
  return `CAPEXSYNC::${row.sourceKey}`;
}

function mapStatusToClickUp(status: string) {
  const s = String(status || '').toLowerCase();
  if (s.includes('done') || s.includes('completed')) return 'complete';
  return 'to do';
}

async function getListTasks(listId: string) {
  const data = await fetchClickUp(`${API_BASE_URL}/list/${listId}/task?include_closed=true&subtasks=true`);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function findExistingTask(tasks: any[], row: CapexSeedRow) {
  const tag = buildTag(row);
  return tasks.find((task) => {
    const description = String(task?.description || '');
    return description.includes(tag) || description.includes(`Source Key: ${row.sourceKey}`) || String(task?.name || '').trim() === row.name.trim();
  });
}

async function createTask(listId: string, row: CapexSeedRow) {
  const payload: any = {
    name: row.name,
    description: `${buildTag(row)}\n${buildDescription(row)}`,
    notify_all: false,
    status: mapStatusToClickUp(row.status),
  };

  const dueDate = normalizeDateTimeToJakartaMs(row.end);
  if (dueDate) payload.due_date = dueDate;

  const startDate = normalizeDateTimeToJakartaMs(row.start);
  if (startDate) payload.start_date = startDate;

  return fetchClickUp(`${API_BASE_URL}/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function updateTask(taskId: string, row: CapexSeedRow) {
  const payload: any = {
    name: row.name,
    description: `${buildTag(row)}\n${buildDescription(row)}`,
    status: mapStatusToClickUp(row.status),
  };

  const dueDate = normalizeDateTimeToJakartaMs(row.end);
  if (dueDate) payload.due_date = dueDate;

  const startDate = normalizeDateTimeToJakartaMs(row.start);
  if (startDate) payload.start_date = startDate;

  try {
    return await fetchClickUp(`${API_BASE_URL}/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } catch (error: any) {
    // Fallback: if status update fails because ClickUp status names differ, update only the safe fields.
    const fallbackPayload = {
      name: row.name,
      description: `${buildTag(row)}\n${buildDescription(row)}`,
      due_date: dueDate,
      start_date: startDate,
    };
    return fetchClickUp(`${API_BASE_URL}/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(fallbackPayload),
    });
  }
}

export async function syncCapexSeedToClickUp() {
  const target = await resolveTargetList();
  const existingTasks = await getListTasks(target.listId);

  const results: Array<{ name: string; action: 'created' | 'updated'; taskId: string; url?: string }> = [];

  for (const row of capexSeedRows) {
    const existing = findExistingTask(existingTasks, row);
    if (existing) {
      const updated = await updateTask(String(existing.id), row);
      results.push({ name: row.name, action: 'updated', taskId: String(updated.id || existing.id), url: updated.url || existing.url });
    } else {
      const created = await createTask(target.listId, row);
      results.push({ name: row.name, action: 'created', taskId: String(created.id), url: created.url });
    }
  }

  return {
    target,
    summary: {
      total: capexSeedRows.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
    },
    results,
  };
}
