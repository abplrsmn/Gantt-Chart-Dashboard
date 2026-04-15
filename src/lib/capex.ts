import { ClickUpTask } from '@/types/clickup';
import { resolveAnyTargetListByName } from '@/lib/clickup-target';
import { differenceInCalendarDays, isValid, parse, startOfDay } from 'date-fns';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const MAPPING_API = '/api/capex/mapping';

function sameName(left?: string, right?: string) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

export type CapexProject = {
  id: string;
  unit: string;
  hotelCode: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  url?: string;
  phase: CapexPhase;
  deadlineRisk: 'none' | 'normal' | 'near' | 'overdue';
  blocked: boolean;
  milestones: CapexMilestones;
  source: 'clickup' | 'seed';
};

export type CapexPhase =
  | 'brief'
  | 'design'
  | 'control'
  | 'project_management'
  | 'handover'
  | 'done'
  | 'blocked';

export type CapexMilestones = {
  briefDate?: string;
  designDate?: string;
  controlDate?: string;
  projectManagementDate?: string;
  handoverDate?: string;
};

export type CapexMappingRow = {
  no: number;
  clickupTaskId: string | null;
  clickupTaskName?: string | null;
};

const CAPEX_SEED_ROWS = [
  { no: 1, unit: 'SPH', name: 'SPH TENNIS COURT INDOOR' },
  { no: 2, unit: 'SPH', name: 'SPH TENNIS COURT 3' },
  { no: 3, unit: 'ALV', name: "AEI : MUR 6'th : deluxe & bussiness" },
  { no: 4, unit: 'ALV', name: 'LANDSCAPE : BOULEVARD' },
  { no: 5, unit: 'ALV', name: 'LANDSCAPE : GATE' },
  { no: 6, unit: 'ALV', name: 'LANDSCAPE : LOBBY DROP OFF' },
  { no: 7, unit: 'ACC', name: 'REPAIR SURFACE TENNIS COURT 5&6' },
  { no: 8, unit: 'ACC', name: 'PATHWAY REPAIR' },
  { no: 9, unit: 'ASM', name: "AEI - MUR 18'TH : Q1 & Q1A" },
  { no: 10, unit: 'AKB', name: '2025 : CANOPY & FACADE NORTH LOBBY' },
  { no: 11, unit: 'AMD', name: 'FR : FACADE REPAIR & REPAINTING' },
  { no: 12, unit: 'APL', name: '2025 : PPR Pipe Replacement' },
  { no: 13, unit: 'AME', name: '2025 : AME wood parquet' },
] as const;

async function fetchClickUpJson(url: string) {
  if (!API_TOKEN || !TEAM_ID) {
    throw new Error('Missing CLICKUP_API_TOKEN or CLICKUP_TEAM_ID');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: API_TOKEN,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.err || data?.error || response.statusText || 'Unknown ClickUp API error';
    throw new Error(`ClickUp API Error ${response.status}: ${message}`);
  }

  return data;
}

async function loadMappingSeed(): Promise<CapexMappingRow[]> {
  try {
    const res = await fetch(MAPPING_API, { cache: 'no-store' });
    const json = await res.json();
    if (json?.success && Array.isArray(json?.data)) return json.data as CapexMappingRow[];
  } catch {
    // ignore
  }
  return [];
}

async function resolveCapexTargetList() {
  return resolveAnyTargetListByName({
    listName: TARGET_LIST_NAME,
    candidates: [
      TARGET_LIST_NAME,
      'CAPEX Gantt',
      'CAPEX',
      'CAPEX Gantt 2025',
      'CAPEX Gantt 2024',
    ],
    spaceName: TARGET_SPACE_NAME,
  });
}

function extractProgress(task: { custom_fields?: Array<{ name?: unknown; value?: unknown }> }): number | undefined {
  const fields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];

  for (const field of fields) {
    const name = String(field?.name || '').toLowerCase();
    if (!name.includes('progress')) continue;

    const raw = field?.value;
    if (typeof raw === 'number') return Math.max(0, Math.min(100, raw));
    if (typeof raw === 'string') {
      const num = Number(raw.replace('%', '').trim());
      if (!Number.isNaN(num)) return Math.max(0, Math.min(100, num));
    }
  }

  return undefined;
}

function extractFieldFromText(text: string | undefined, label: string): string | undefined {
  if (!text) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\n)${escaped}:\\s*(.+)`, 'i');
  const match = text.match(regex);
  if (!match?.[1]) return undefined;
  return match[1].trim();
}

function extractProgressFromText(text: string | undefined): number | undefined {
  const raw = extractFieldFromText(text, 'Progress');
  if (!raw) return undefined;
  const value = Number(raw.replace('%', '').replace(',', '.').trim());
  if (Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

function parseDateLabel(value?: string): Date | null {
  if (!value) return null;
  const formats = ['d MMM yyyy', 'd MMMM yyyy', 'd-MMM-yyyy', 'd-MMMM-yyyy'];

  for (const fmt of formats) {
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }

  return null;
}

function getDeadlineRisk(end?: string): CapexProject['deadlineRisk'] {
  const endDate = parseDateLabel(end);
  if (!endDate) return 'none';
  const daysLeft = differenceInCalendarDays(startOfDay(endDate), startOfDay(new Date()));
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 14) return 'near';
  return 'normal';
}

function getMilestoneDate(task: ClickUpTask, description: string | undefined, labels: string[]): string | undefined {
  for (const label of labels) {
    const fromField = extractCustomField(task, label);
    if (fromField) return fromField;
    const fromText = extractFieldFromText(description, label);
    if (fromText) return fromText;
  }
  return undefined;
}

function resolvePhase(input: {
  status: string;
  progress?: number;
  milestones: CapexMilestones;
  explicitPhase?: string;
}) : CapexPhase {
  const explicit = String(input.explicitPhase || '').toLowerCase().trim();
  if (explicit === 'brief') return 'brief';
  if (explicit === 'design') return 'design';
  if (explicit === 'control') return 'control';
  if (explicit === 'project_management' || explicit === 'project management') return 'project_management';
  if (explicit === 'handover') return 'handover';
  if (explicit === 'done' || explicit === 'completed') return 'done';
  if (explicit === 'blocked') return 'blocked';

  const status = input.status.toLowerCase();
  const blockedByStatus = status.includes('blocked') || status.includes('pending contract') || status.includes('delay');
  if (blockedByStatus) return 'blocked';
  if (status.includes('done') || status.includes('completed') || (input.progress ?? 0) >= 100) return 'done';
  if (input.milestones.handoverDate || status.includes('handover') || status.includes('bast')) return 'handover';
  if (input.milestones.projectManagementDate || status.includes('commenced') || status.includes('ongoing') || status.includes('on schedule')) return 'project_management';
  if (input.milestones.controlDate || status.includes('contract') || status.includes('tender')) return 'control';
  if (input.milestones.designDate || status.includes('design')) return 'design';
  return 'brief';
}

function extractCustomField(task: { custom_fields?: Array<{ name?: unknown; value?: unknown }> }, wanted: string): string | undefined {
  const fields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  const lowerWanted = wanted.toLowerCase();

  for (const field of fields) {
    const name = String(field?.name || '').toLowerCase();
    if (name !== lowerWanted) continue;
    const value = field?.value;
    if (value == null) return undefined;
    return String(value);
  }

  return undefined;
}

function formatClickUpDate(ms?: string) {
  if (!ms) return undefined;
  const num = Number(ms);
  if (!Number.isFinite(num)) return undefined;
  return new Date(num).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function mapTaskToCapex(task: ClickUpTask, seedRow: { no: number; unit: string; name: string }, seedMapping?: CapexMappingRow): CapexProject {
  const assignee = Array.isArray(task.assignees) && task.assignees.length > 0 ? task.assignees[0]?.username : undefined;
  const description = typeof task.description === 'string' ? task.description : undefined;
  const descStart = extractFieldFromText(description, 'Start');
  const descEnd = extractFieldFromText(description, 'End');
  const descStatus = extractFieldFromText(description, 'Status');
  const descPhase = extractFieldFromText(description, 'Phase');
  const descPic = extractFieldFromText(description, 'PIC');
  const descNextAction = extractFieldFromText(description, 'Next Action');
  const descStatusNote = extractFieldFromText(description, 'Status Note') || extractFieldFromText(description, 'Project Status Note');
  const fieldProgress = extractProgress(task);
  const descProgress = extractProgressFromText(description);
  const computedProgress = fieldProgress ?? descProgress;
  const resolvedStatus = descStatus || task.status?.status || 'OPEN';
  const milestones: CapexMilestones = {
    briefDate: getMilestoneDate(task, description, ['Operational Brief Date', 'Operational Brief', 'Brief Date', 'Received Date']),
    designDate: getMilestoneDate(task, description, ['Design Approval Date', 'Design Date', 'Design (HoD)']),
    controlDate: getMilestoneDate(task, description, ['APS SPK Released', 'Tender Start', 'Project Control Date']),
    projectManagementDate: getMilestoneDate(task, description, ['Commence Date', 'Project Management Date']),
    handoverDate: getMilestoneDate(task, description, ['Bast 1', 'Bast 2', 'Handover Date']),
  };
  const phase = resolvePhase({ status: resolvedStatus, progress: computedProgress, milestones, explicitPhase: descPhase });
  const deadlineRisk = getDeadlineRisk(formatClickUpDate(task.due_date) || descEnd);
  const blocked = phase === 'blocked';

  return {
    id: seedMapping?.clickupTaskId ? String(seedMapping.clickupTaskId) : String(task.id),
    unit: seedRow.unit,
    hotelCode: seedRow.unit,
    name: seedMapping?.clickupTaskName || seedRow.name,
    start: formatClickUpDate(task.start_date) || descStart || formatClickUpDate(task.date_created),
    end: formatClickUpDate(task.due_date) || descEnd,
    status: resolvedStatus,
    progress: computedProgress,
    note: extractCustomField(task, 'Status Note') || descStatusNote || description,
    pic: assignee || descPic,
    nextAction: extractCustomField(task, 'Next Action') || descNextAction,
    url: task.url,
    phase,
    deadlineRisk,
    blocked,
    milestones,
    source: 'clickup',
  };
}

export async function getCapexProjects(): Promise<CapexProject[]> {
  const targetList = await resolveCapexTargetList();

  const data = await fetchClickUpJson(`${API_BASE_URL}/list/${targetList.listId}/task?subtasks=true&include_closed=true`);
  const tasks: ClickUpTask[] = Array.isArray(data?.tasks) ? data.tasks as ClickUpTask[] : [];
  const mappingSeed = await loadMappingSeed();
  const mappingByNo = new Map(mappingSeed.map((row) => [row.no, row]));
  const taskByName = new Map(tasks.map((task) => [String(task.name || '').trim().toLowerCase(), task]));

  return CAPEX_SEED_ROWS.map((seedRow) => {
    const seedMapping = mappingByNo.get(seedRow.no);
    const matchedTask = seedMapping?.clickupTaskId
      ? tasks.find((task) => String(task.id) === String(seedMapping.clickupTaskId))
      : taskByName.get(seedRow.name.trim().toLowerCase()) || tasks.find((task) => String(task.name || '').trim().toLowerCase().includes(seedRow.name.trim().toLowerCase()));

    const task = matchedTask || tasks.find((t) => String(t.id) === String(seedMapping?.clickupTaskId));

    if (!task) {
      return {
        id: String(seedMapping?.clickupTaskId || seedRow.no),
        unit: seedRow.unit,
        hotelCode: seedRow.unit,
        name: seedMapping?.clickupTaskName || seedRow.name,
        status: 'OPEN',
        phase: 'brief',
        deadlineRisk: 'none',
        blocked: false,
        milestones: {},
        source: 'seed',
      };
    }

    return mapTaskToCapex(task, seedRow, seedMapping);
  });
}
