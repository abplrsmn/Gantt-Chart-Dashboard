import { promises as fs } from 'fs';
import path from 'path';
import { resolveAnyTargetListByName } from '@/lib/clickup-target';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^["']|["']$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';
const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'capex-summary.normalized.json');

type SummaryProject = {
  sourceRow: number;
  hotelCode: string;
  projectNo: string | number;
  projectName: string;
  description?: string | null;
  receivedDate?: string | null;
  budgetCapex?: string | number | null;
  startDesignDate?: string | null;
  designApproval?: string | null;
  designDelayDays?: string | number | null;
  briefNote?: string | null;
  workingDrawingDate?: string | null;
  tenderStart?: string | null;
  apsReleaseDate?: string | null;
  tenderDelayDays?: string | number | null;
  contractAmount?: string | number | null;
  commenceDate?: string | null;
  endContract?: string | null;
  actualCompletion?: string | null;
  deviationDays?: string | number | null;
  currentSiteProgress?: string | null;
  remarks?: string | null;
  bast1?: string | null;
  bast2?: string | null;
  phase?: string;
  taskName?: string;
  sourceKey?: string;
};

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.err || data?.error || `ClickUp API error ${response.status}`);
  return data;
}

async function resolveTargetList() {
  return resolveAnyTargetListByName({
    listName: TARGET_LIST_NAME,
    spaceName: TARGET_SPACE_NAME,
  });
}

function buildTaskName(row: SummaryProject) {
  return `${row.hotelCode} - ${row.projectName}`;
}

function buildTag(row: SummaryProject) {
  return `SUMMARYSYNC::${row.sourceKey || `${row.hotelCode}|${row.projectName}|${row.sourceRow}`}`;
}

function toDisplayDate(value?: string | null) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n > 1000 && n < 60000) {
      const d = new Date(1899, 11, 30 + n);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00+07:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return s;
}

function formatField(label: string, value: unknown, transform?: (v: unknown) => string | null) {
  if (value === null || value === undefined || value === '') return null;
  const rendered = transform ? transform(value) : String(value);
  if (!rendered) return null;
  return `${label}: ${rendered}`;
}

function buildDescription(row: SummaryProject) {
  const lines = [
    buildTag(row),
    '',
    'BASIC',
    `Source Row: ${row.sourceRow}`,
    `Hotel Code: ${row.hotelCode}`,
    `Project No: ${row.projectNo}`,
    `Project Name: ${row.projectName}`,
    formatField('Description', row.description),
    formatField('Phase', row.phase),
    '',
    'MILESTONES',
    formatField('Received Date', row.receivedDate, toDisplayDate),
    formatField('Budget CAPEX', row.budgetCapex),
    formatField('Start Design Date', row.startDesignDate, toDisplayDate),
    formatField('Design Approval', row.designApproval, toDisplayDate),
    formatField('Design Delay Days', row.designDelayDays),
    formatField('Brief Note', row.briefNote),
    formatField('Working Drawing Date', row.workingDrawingDate, toDisplayDate),
    formatField('Tender Start', row.tenderStart, toDisplayDate),
    formatField('APS Release Date', row.apsReleaseDate, toDisplayDate),
    formatField('Tender Delay Days', row.tenderDelayDays),
    formatField('Contract Amount', row.contractAmount),
    formatField('Commence Date', row.commenceDate, toDisplayDate),
    formatField('End Contract', row.endContract, toDisplayDate),
    formatField('Actual Completion', row.actualCompletion, toDisplayDate),
    formatField('Deviation Days', row.deviationDays),
    '',
    'PROGRESS & NOTES',
    formatField('Current Site Progress', row.currentSiteProgress),
    formatField('Remarks', row.remarks),
    formatField('BAST-1', row.bast1, toDisplayDate),
    formatField('BAST-2', row.bast2, toDisplayDate),
    '',
    'Managed by CAPEX summary sync',
  ].filter(Boolean);
  return lines.join('\n');
}

function normalizeNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const s = String(value).trim().replace(/,/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return undefined;
}

function mapStatus(row: SummaryProject) {
  // Keep ClickUp status mapping conservative to avoid "Status not found" failures.
  const phase = String(row.phase || '').toLowerCase();
  const note = `${row.currentSiteProgress || ''} ${row.description || ''} ${row.remarks || ''}`.toLowerCase();
  if (note.includes('cancel') || note.includes('blocked')) return 'to do';
  if (phase === 'done' || note.includes('done') || note.includes('complete') || note.includes('completed')) return 'complete';
  return 'to do';
}

function isLikelyDate(value?: string | null) {
  if (!value) return false;
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[- ][A-Za-z]+[- ]\d{4}$/.test(s) || /^\d+$/.test(s);
}

function toDueMs(value?: string | null) {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n > 1000) return new Date(1899, 11, 30 + n).getTime();
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getListTasks(listId: string) {
  const data = await fetchClickUp(`${API_BASE_URL}/list/${listId}/task?include_closed=true&subtasks=true`);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function findExistingTask(tasks: any[], row: SummaryProject) {
  const tag = buildTag(row);
  const expectedName = buildTaskName(row).trim();
  return tasks.find((task) => {
    const description = String(task?.description || '');
    const name = String(task?.name || '').trim();
    return description.includes(tag) || name === expectedName || name === row.projectName.trim();
  });
}

async function createTask(listId: string, row: SummaryProject) {
  const payload: any = {
    name: buildTaskName(row),
    description: buildDescription(row),
    notify_all: false,
  };
  const status = mapStatus(row);
  if (status) payload.status = status;
  const due = toDueMs(row.endContract || row.actualCompletion || row.apsReleaseDate || row.tenderStart || row.commenceDate || row.startDesignDate);
  if (due) payload.due_date = due;
  const start = toDueMs(row.receivedDate || row.startDesignDate || row.commenceDate);
  if (start) payload.start_date = start;
  return fetchClickUp(`${API_BASE_URL}/list/${listId}/task`, { method: 'POST', body: JSON.stringify(payload) });
}

async function updateTask(taskId: string, row: SummaryProject) {
  const payload: any = {
    name: buildTaskName(row),
    description: buildDescription(row),
  };
  const status = mapStatus(row);
  if (status) payload.status = status;
  const due = toDueMs(row.endContract || row.actualCompletion || row.apsReleaseDate || row.tenderStart || row.commenceDate || row.startDesignDate);
  if (due) payload.due_date = due;
  const start = toDueMs(row.receivedDate || row.startDesignDate || row.commenceDate);
  if (start) payload.start_date = start;
  try {
    return await fetchClickUp(`${API_BASE_URL}/task/${taskId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } catch {
    const fallback = { name: buildTaskName(row), description: buildDescription(row), due_date: due, start_date: start };
    return fetchClickUp(`${API_BASE_URL}/task/${taskId}`, { method: 'PUT', body: JSON.stringify(fallback) });
  }
}

export async function syncCapexSummaryToClickUp() {
  const target = await resolveTargetList();
  const raw = await fs.readFile(SUMMARY_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { projects: SummaryProject[] };
  const rows = Array.isArray(parsed.projects) ? parsed.projects : [];
  const existingTasks = await getListTasks(target.listId);
  const results: Array<{ name: string; action: 'created' | 'updated'; taskId: string; url?: string }> = [];

  for (const row of rows) {
    const existing = findExistingTask(existingTasks, row);
    if (existing) {
      const updated = await updateTask(String(existing.id), row);
      results.push({ name: row.projectName, action: 'updated', taskId: String(updated.id || existing.id), url: updated.url || existing.url });
    } else {
      const created = await createTask(target.listId, row);
      results.push({ name: row.projectName, action: 'created', taskId: String(created.id), url: created.url });
    }
  }

  return {
    target,
    summary: {
      total: rows.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
    },
    results,
  };
}
