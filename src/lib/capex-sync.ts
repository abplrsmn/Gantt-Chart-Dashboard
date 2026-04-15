import { capexSeedRows, type CapexSeedRow } from '@/lib/capex-seed';
import { resolveAnyTargetListByName } from '@/lib/clickup-target';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^["']|["']$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';

type CapexMilestoneKey = 'brief' | 'design' | 'control' | 'projectManagement' | 'handover';

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

  const dmy = text.match(/\b(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})\b/);
  if (dmy) {
    return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;
  }

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

  const namedWithSeparator = lowered.match(/\b(\d{1,2})[-\/]([a-z]+)[-\/](20\d{2})\b/i);
  if (namedWithSeparator) {
    const month = monthMap[namedWithSeparator[2].toLowerCase()];
    if (month) return `${namedWithSeparator[3]}-${month}-${pad2(namedWithSeparator[1])}`;
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
  return resolveAnyTargetListByName({
    listName: TARGET_LIST_NAME,
    spaceName: TARGET_SPACE_NAME,
  });
}

function inferPhase(row: CapexSeedRow): CapexMilestoneKey | 'done' | 'blocked' {
  if (row.phase) return row.phase;

  const statusLower = row.status.toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('completed')) return 'done';
  if (statusLower.includes('blocked') || statusLower.includes('pending')) return 'blocked';
  if (row.milestones?.handoverDate) return 'handover';
  if (row.milestones?.projectManagementDate || statusLower.includes('commenced') || statusLower.includes('ongoing') || statusLower.includes('schedule')) return 'projectManagement';
  if (row.milestones?.controlDate || statusLower.includes('contract') || statusLower.includes('tender')) return 'control';
  if (row.milestones?.designDate || statusLower.includes('design')) return 'design';
  return 'brief';
}

function phaseToLabel(phase: string) {
  switch (phase) {
    case 'brief': return 'Operational Brief / PR';
    case 'design': return 'Design (HoD)';
    case 'control': return 'Project Control';
    case 'projectManagement': return 'Project Management Team';
    case 'handover': return 'Handover';
    case 'done': return 'Completed';
    case 'blocked': return 'Blocked';
    default: return 'Operational Brief / PR';
  }
}

function buildDescription(row: CapexSeedRow) {
  const phase = inferPhase(row);
  const lines = [
    `CAPEXSYNC::${row.sourceKey}`,
    `Source Key: ${row.sourceKey}`,
    `Hotel Code: ${row.unit}`,
    `Unit: ${row.unit}`,
    `Project Name: ${row.name}`,
    `Phase: ${phase}`,
    `Phase Label: ${phaseToLabel(phase)}`,
    row.start ? `Start: ${row.start}` : null,
    row.end ? `End: ${row.end}` : null,
    row.milestones?.briefDate ? `Operational Brief Date: ${row.milestones.briefDate}` : null,
    row.milestones?.designDate ? `Design Approval Date: ${row.milestones.designDate}` : null,
    row.milestones?.controlDate ? `Project Control Date: ${row.milestones.controlDate}` : null,
    row.milestones?.projectManagementDate ? `Project Management Date: ${row.milestones.projectManagementDate}` : null,
    row.milestones?.handoverDate ? `Handover Date: ${row.milestones.handoverDate}` : null,
    `Status: ${row.status}`,
    row.progress !== undefined ? `Progress: ${row.progress}%` : null,
    row.pic ? `PIC: ${row.pic}` : null,
    row.note ? `Status Note: ${row.note}` : null,
    row.nextAction ? `Next Action: ${row.nextAction}` : null,
    'Managed by CAPEX sync pipeline',
  ].filter(Boolean);

  return lines.join('\n');
}

function buildTaskName(row: CapexSeedRow) {
  return `${row.unit} - ${row.name}`;
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
  const expectedName = buildTaskName(row).trim();
  return tasks.find((task) => {
    const description = String(task?.description || '');
    const name = String(task?.name || '').trim();
    return description.includes(tag) || description.includes(`Source Key: ${row.sourceKey}`) || name === expectedName || name === row.name.trim();
  });
}

async function createTask(listId: string, row: CapexSeedRow) {
  const payload: any = {
    name: buildTaskName(row),
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
    name: buildTaskName(row),
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
  } catch {
    const fallbackPayload = {
      name: buildTaskName(row),
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
