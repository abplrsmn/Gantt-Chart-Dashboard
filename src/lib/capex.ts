import { ClickUpTask } from '@/types/clickup';
import { resolveAnyTargetListByName } from '@/lib/clickup-target';
import { differenceInCalendarDays, isValid, parse, startOfDay } from 'date-fns';
import { promises as fs } from 'fs';
import path from 'path';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const TARGET_LIST_CANDIDATES = [
  'CAPEX Gantt 2026',
  'CAPEX Gantt',
  'CAPEX',
  'CAPEX Gantt 2025',
  'CAPEX Gantt 2024',
];
const MAPPING_API = '/api/capex/mapping';
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'capex-summary.normalized.json');

type ClickUpTaskEx = ClickUpTask & {
  description?: string;
  start_date?: string;
  custom_fields?: Array<{ name?: unknown; value?: unknown }>;
};

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
  isExecution: boolean;
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

const LEGACY_CAPEX_SEED_ROWS = [
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

type SummarySeedRow = {
  sourceRow?: number;
  hotelCode?: string;
  projectName?: string;
  taskName?: string;
  commenceDate?: string | null;
  receivedDate?: string | null;
  startDesignDate?: string | null;
  endContract?: string | null;
  phase?: string | null;
  currentSiteProgress?: string | number | null;
  description?: string | null;
  remarks?: string | null;
};

type CapexSeedProjectRow = {
  no: number;
  unit: string;
  name: string;
  start?: string;
  end?: string;
  status?: string;
  progress?: number;
  note?: string;
  nextAction?: string;
  phase?: CapexPhase;
};

function formatSummaryDate(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
  }

  return trimmed;
}

function normalizeSummaryPhase(phase?: string | null): CapexPhase | undefined {
  const normalized = String(phase || '').trim().toLowerCase();
  if (normalized === 'brief') return 'brief';
  if (normalized === 'design') return 'design';
  if (normalized === 'control') return 'control';
  if (normalized === 'project_management' || normalized === 'project management') return 'project_management';
  if (normalized === 'handover') return 'handover';
  if (normalized === 'done' || normalized === 'completed') return 'done';
  if (normalized === 'blocked') return 'blocked';
  return undefined;
}

async function loadCapexSeedRows(): Promise<CapexSeedProjectRow[]> {
  try {
    const raw = await fs.readFile(SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { projects?: SummarySeedRow[] };
    const rows = Array.isArray(parsed?.projects) ? parsed.projects : [];

      let lastUnit = '';

      const mapped = rows
        .map((row, index) => {
          let unit = String(row.hotelCode || '').trim().toUpperCase();
          if (unit) {
            lastUnit = unit;
          } else {
            unit = lastUnit;
          }

          const name = String(row.projectName || row.taskName || '').trim();
          if (!name) return null;
        const numericProgress = typeof progressRaw === 'number'
          ? progressRaw
          : typeof progressRaw === 'string'
            ? Number(progressRaw.replace('%', '').trim())
            : undefined;

        return {
          no: Number.isFinite(Number(row.sourceRow)) ? Number(row.sourceRow) : index + 1,
          unit,
          name,
          start: formatSummaryDate(row.commenceDate || row.receivedDate || row.startDesignDate),
          end: formatSummaryDate(row.endContract),
          status: String(row.phase || 'OPEN').toUpperCase(),
          progress: Number.isFinite(numericProgress) ? Math.max(0, Math.min(100, Number(numericProgress))) : undefined,
          note: typeof row.currentSiteProgress === 'string' && row.currentSiteProgress.trim().length > 0
            ? row.currentSiteProgress.trim()
            : (row.description || undefined),
          nextAction: row.remarks || undefined,
          phase: normalizeSummaryPhase(row.phase),
        } as CapexSeedProjectRow;
      })
      .filter((row): row is CapexSeedProjectRow => row !== null);

    if (mapped.length > 0) return mapped;
  } catch {
    // Fallback to static seed rows if summary file is unavailable.
  }

  return LEGACY_CAPEX_SEED_ROWS.map((row) => ({ ...row }));
}

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
    candidates: TARGET_LIST_CANDIDATES,
    spaceName: TARGET_SPACE_NAME,
  });
}

function extractProgress(task: ClickUpTaskEx): number | undefined {
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
  const knownKeys = [
    'Source Key',
    'Hotel Code',
    'Unit',
    'Project Name',
    'Description',
    'Phase',
    'Status',
    'Progress',
    'PIC',
    'Status Note',
    'Project Status Note',
    'Next Action',
    'Operational Brief Date',
    'Operational Brief',
    'Brief Date',
    'Received Date',
    'RECEIVED_DATE',
    'Design Approval Date',
    'Design Date',
    'Design (HoD)',
    'DESIGN_APPROVAL',
    'START_DESIGN_DATE',
    'APS SPK Released',
    'APS Release Date',
    'Tender Start',
    'Project Control Date',
    'SPK_RELEASED',
    'TENDER_START',
    'Commence Date',
    'Project Management Date',
    'COMMENCE_DATE',
    'Bast 1',
    'Bast 2',
    'BAST_1',
    'BAST_2',
    'Handover Date',
  ];

  const keyPattern = knownKeys
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const regex = new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?=(?:\\n|\\s)(?:${keyPattern}):|$)`, 'i');
  const match = text.match(regex);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\s+/g, ' ').trim();
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

function getMilestoneDate(task: ClickUpTaskEx, description: string | undefined, labels: string[]): string | undefined {
  for (const label of labels) {
    const fromField = extractCustomField(task, label);
    if (fromField) return fromField;
    const fromText = extractFieldFromText(description, label);
    if (fromText) return fromText;
  }
  return undefined;
}

function isValidMilestoneDate(val?: string | number | null): boolean {
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  if (str === '' || str === '-') return false;
  
  // Exclude common non-date status words
  const excludeTokens = [
    'awaiting', 'cancel', 'complete', 'done', 'tba', 'tbd', 
    'n/a', 'progress', 'pending', 'hold', 'not ', 'remarks', 
    'brief', 'pr', 'ongoing', 'schedule', 'empty'
  ];
  if (excludeTokens.some(token => str.includes(token))) {
    return false;
  }

  // Pure digits: Excel epoch or Unix ms
  if (/^\d{4,5}$/.test(str)) return true;
  if (/^\d{12,14}$/.test(str)) return true;

  // Pattern detection for typical date formats
  const dateMatch = /\d{1,4}[-/.\s][a-zA-Z0-9]{2,}[-/.\s]\d{2,4}/.test(str);
  if (dateMatch) return true;

  // Let Date parser try it
  const parsed = Date.parse(str);
  return !isNaN(parsed);
}

const GANTT_EXECUTION_PROJECTS = [
  "SPH TENNIS COURT INDOOR",
  "SPH TENNIS COURT 3",
  "AEI : MUR 6'th : deluxe & bussiness",
  "LANDSCAPE : BOULEVARD",
  "LANDSCAPE : GATE",
  "LANDSCAPE : LOBBY DROP OFF",
  "REPAIR SURFACE TENNIS COURT 5&6",
  "PATHWAY REPAIR",
  "AEI - MUR 18'TH : Q1 & Q1A",
  "2025 : CANOPY & FACADE NORTH LOBBY",
  "FR : FACADE REPAIR & REPAINTING",
  "2025 : PPR Pipe Replacement",
  "2025 : AME wood parquet"
].map(p => p.toLowerCase());

function isGanttExecution(projectName: string, taskName?: string): boolean {
  const name1 = String(projectName || '').toLowerCase().trim();
  const name2 = String(taskName || '').toLowerCase().trim();
  return GANTT_EXECUTION_PROJECTS.some(g => name1.includes(g) || name2.includes(g));
}

function resolvePhase(input: {
  status: string;
  progress?: number;
  milestones: CapexMilestones;
  explicitPhase?: string;
  isExecution?: boolean;
}) : CapexPhase {
  const explicit = String(input.explicitPhase || '').toLowerCase().trim();
  const status = input.status.toLowerCase();

  const blockedByStatus = status.includes('blocked') || status.includes('pending contract') || status.includes('delay');
  if (blockedByStatus || explicit === 'blocked') return 'blocked';
  if (status.includes('done') || status.includes('completed') || explicit === 'done' || explicit === 'completed' || (input.progress ?? 0) >= 100) return 'done';

  // Even if not in execution, if they somehow reached handover with BAST, we shouldn't block it 
  if (isValidMilestoneDate(input.milestones.handoverDate)) return 'handover';
  
  // Strict matching for Project Management: Must have Commence Date AND must be in the curated execution list
  if (isValidMilestoneDate(input.milestones.projectManagementDate) && input.isExecution) return 'project_management';
  
  if (isValidMilestoneDate(input.milestones.controlDate)) return 'control';
  if (isValidMilestoneDate(input.milestones.designDate)) return 'design';
  if (isValidMilestoneDate(input.milestones.briefDate)) return 'brief';

  return 'brief'; // 6. awaiting_pr / early stage
}

function extractCustomField(task: ClickUpTaskEx, wanted: string): string | undefined {
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

function buildProjectId(seedRowNo: number, taskId?: string, mappedId?: string | null) {
  const stableTaskId = String(mappedId || taskId || seedRowNo);
  return `seed:${seedRowNo}:${stableTaskId}`;
}

function inferUnitFromTask(task: ClickUpTaskEx, description?: string) {
  const fromDescription = extractFieldFromText(description, 'Hotel Code') || extractFieldFromText(description, 'Unit');
  if (fromDescription) return fromDescription.trim().toUpperCase();

  const byName = String(task.name || '').trim().match(/^([A-Za-z]{2,5})\s*-\s*/);
  if (byName?.[1]) return byName[1].toUpperCase();

  return 'UNKNOWN';
}

function mapTaskToCapex(task: ClickUpTaskEx, seedRow: CapexSeedProjectRow, seedMapping?: CapexMappingRow): CapexProject {
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
    briefDate: getMilestoneDate(task, description, ['Operational Brief Date', 'Operational Brief', 'Brief Date', 'Received Date', 'RECEIVED_DATE']),
    designDate: getMilestoneDate(task, description, ['Start Design Date', 'START_DESIGN_DATE', 'Design Date', 'Design (HoD)', 'Design Approval Date', 'DESIGN_APPROVAL']),
    controlDate: getMilestoneDate(task, description, ['APS SPK Released', 'APS Release Date', 'Tender Start', 'Project Control Date', 'SPK_RELEASED', 'TENDER_START']),
    projectManagementDate: getMilestoneDate(task, description, ['Commence Date', 'Project Management Date', 'COMMENCE_DATE']),
    handoverDate: getMilestoneDate(task, description, ['Bast 1', 'Bast 2', 'BAST_1', 'BAST_2', 'Handover Date']),
  };
  const isExecution = isGanttExecution(seedRow?.name || '', task.name);
  const phase = resolvePhase({ status: resolvedStatus, progress: computedProgress, milestones, explicitPhase: seedRow?.phase || descPhase, isExecution });
  const deadlineRisk = getDeadlineRisk(formatClickUpDate(task.due_date) || descEnd);
  const blocked = phase === 'blocked';

  return {
    id: buildProjectId(seedRow.no, String(task.id), seedMapping?.clickupTaskId),
    unit: seedRow.unit,
    hotelCode: seedRow.unit,
    name: seedMapping?.clickupTaskName || seedRow.name,
    start: milestones.briefDate || formatClickUpDate(task.start_date) || descStart || formatClickUpDate(task.date_created),
    end: milestones.handoverDate || formatClickUpDate(task.due_date) || descEnd,
    status: resolvedStatus,
    progress: computedProgress,
    note: extractCustomField(task, 'Status Note') || descStatusNote || description,
    pic: assignee || descPic,
    nextAction: extractCustomField(task, 'Next Action') || descNextAction,
    url: task.url,
    phase,
    isExecution,
    deadlineRisk,
    blocked,
    milestones,
    source: 'clickup',
  };
}

function mapClickUpTaskWithoutSeed(task: ClickUpTaskEx): CapexProject {
  const description = typeof task.description === 'string' ? task.description : undefined;
  const descStart = extractFieldFromText(description, 'Start');
  const descEnd = extractFieldFromText(description, 'End');
  const descStatus = extractFieldFromText(description, 'Status');
  const descPhase = extractFieldFromText(description, 'Phase');
  const descPic = extractFieldFromText(description, 'PIC');
  const descNextAction = extractFieldFromText(description, 'Next Action');
  const descStatusNote = extractFieldFromText(description, 'Status Note') || extractFieldFromText(description, 'Project Status Note');
  const descProjectName = extractFieldFromText(description, 'Project Name');

  const fieldProgress = extractProgress(task);
  const descProgress = extractProgressFromText(description);
  const computedProgress = fieldProgress ?? descProgress;
  const resolvedStatus = descStatus || task.status?.status || 'OPEN';
  const milestones: CapexMilestones = {
    briefDate: getMilestoneDate(task, description, ['Operational Brief Date', 'Operational Brief', 'Brief Date', 'Received Date', 'RECEIVED_DATE']),
    designDate: getMilestoneDate(task, description, ['Start Design Date', 'START_DESIGN_DATE', 'Design Date', 'Design (HoD)', 'Design Approval Date', 'DESIGN_APPROVAL']),
    controlDate: getMilestoneDate(task, description, ['APS SPK Released', 'APS Release Date', 'Tender Start', 'Project Control Date', 'SPK_RELEASED', 'TENDER_START']),
    projectManagementDate: getMilestoneDate(task, description, ['Commence Date', 'Project Management Date', 'COMMENCE_DATE']),
    handoverDate: getMilestoneDate(task, description, ['Bast 1', 'Bast 2', 'BAST_1', 'BAST_2', 'Handover Date']),
  };

  const unit = inferUnitFromTask(task, description);
  const title = descProjectName || String(task.name || '').replace(/^[A-Za-z]{2,5}\s*-\s*/, '').trim();
  const isExecution = isGanttExecution(title, task.name);
  
  const phase = resolvePhase({ status: resolvedStatus, progress: computedProgress, milestones, explicitPhase: descPhase, isExecution });
  const deadlineRisk = getDeadlineRisk(formatClickUpDate(task.due_date) || descEnd);

  return {
    id: `clickup:${task.id}`,
    unit,
    hotelCode: unit,
    name: title,
    start: milestones.briefDate || formatClickUpDate(task.start_date) || descStart || formatClickUpDate(task.date_created),
    end: milestones.handoverDate || formatClickUpDate(task.due_date) || descEnd,
    status: resolvedStatus,
    progress: computedProgress,
    note: extractCustomField(task, 'Status Note') || descStatusNote || description,
    pic: (Array.isArray(task.assignees) && task.assignees.length > 0 ? task.assignees[0]?.username : undefined) || descPic,
    nextAction: extractCustomField(task, 'Next Action') || descNextAction,
    url: task.url,
    phase,
    isExecution,
    deadlineRisk,
    blocked: phase === 'blocked',
    milestones,
    source: 'clickup',
  };
}

export async function getCapexProjects(): Promise<CapexProject[]> {
  const targetList = await resolveCapexTargetList();

  const data = await fetchClickUpJson(`${API_BASE_URL}/list/${targetList.listId}/task?subtasks=true&include_closed=true`);
  const tasks: ClickUpTaskEx[] = Array.isArray(data?.tasks) ? data.tasks as ClickUpTaskEx[] : [];
  const seedRows = await loadCapexSeedRows();
  const mappingSeed = await loadMappingSeed();
  const mappingByNo = new Map(mappingSeed.map((row) => [row.no, row]));
  const taskByName = new Map(tasks.map((task) => [String(task.name || '').trim().toLowerCase(), task]));
  const usedTaskIds = new Set<string>();

  const seededProjects = seedRows.map((seedRow) => {
    const seedMapping = mappingByNo.get(seedRow.no);
    const matchedTask = seedMapping?.clickupTaskId
      ? tasks.find((task) => String(task.id) === String(seedMapping.clickupTaskId))
      : taskByName.get(seedRow.name.trim().toLowerCase()) || tasks.find((task) => String(task.name || '').trim().toLowerCase().includes(seedRow.name.trim().toLowerCase()));

    const task = matchedTask || tasks.find((t) => String(t.id) === String(seedMapping?.clickupTaskId));
    if (task?.id) usedTaskIds.add(String(task.id));

    if (!task) {
      const fallbackProject: CapexProject = {
        id: buildProjectId(seedRow.no, undefined, seedMapping?.clickupTaskId),
        unit: seedRow.unit,
        hotelCode: seedRow.unit,
        name: seedMapping?.clickupTaskName || seedRow.name,
        start: seedRow.start,
        end: seedRow.end,
        status: seedRow.status || 'OPEN',
        progress: seedRow.progress,
        note: seedRow.note,
        nextAction: seedRow.nextAction,
        phase: seedRow.phase || 'brief',
        isExecution: isGanttExecution(seedRow.name),
        deadlineRisk: 'none',
        blocked: false,
        milestones: {},
        source: 'seed',
      };

      return fallbackProject;
    }

    return mapTaskToCapex(task, seedRow, seedMapping);
  });

  const additionalClickUpProjects = tasks
    .filter((task) => !usedTaskIds.has(String(task.id)))
    .map((task) => mapClickUpTaskWithoutSeed(task));

  return [...seededProjects, ...additionalClickUpProjects];
}
