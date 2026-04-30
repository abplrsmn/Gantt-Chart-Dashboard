import { ClickUpTask } from '@/types/clickup';
import { differenceInCalendarDays, isValid, parse, startOfDay } from 'date-fns';
import { promises as fs } from 'fs';
import path from 'path';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const TARGET_LIST_ID = '901817189531';
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

const LEGACY_CAPEX_SEED_ROWS = [] as const;

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
  return { listId: TARGET_LIST_ID, listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME };
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
  const lowered = label.trim().toLowerCase();
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    if (key === lowered) {
      const value = trimmed.slice(idx + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

function extractPercent(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  if (Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

function extractProgressFromText(text: string | undefined): number | undefined {
  const raw = extractFieldFromText(text, 'Progress');
  return extractPercent(raw);
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

function isGanttExecution(projectName: string, taskName?: string, milestones?: CapexMilestones): boolean {
  const name1 = String(projectName || '').toLowerCase().trim();
  const name2 = String(taskName || '').toLowerCase().trim();
  const combined = `${name1} ${name2}`;

  const negativeHints = ['aborted', 'cancelled', 'canceled'];
  if (negativeHints.some((hint) => combined.includes(hint))) return false;

  if (isValidMilestoneDate(milestones?.projectManagementDate) || isValidMilestoneDate(milestones?.handoverDate)) {
    return true;
  }

  return false;
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

function normalizeProjectTitle(value?: string) {
  let normalized = String(value || '').trim().toLowerCase();
  normalized = normalized.replace(/^[a-z]{2,5}\s*-\s*/i, '');
  normalized = normalized.replace(/\bbrief\s*:.*$/i, '');
  normalized = normalized.replace(/\bstart\s*:.*$/i, '');
  normalized = normalized.replace(/[“”"'`]/g, '');
  normalized = normalized.replace(/[\s\-_]+/g, ' ');
  return normalized.trim();
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
  const isExecution = isGanttExecution(seedRow?.name || '', task.name, milestones);
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
  const isExecution = isGanttExecution(title, task.name, milestones);
  
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
  const rawTasks: ClickUpTaskEx[] = Array.isArray(data?.tasks) ? data.tasks as ClickUpTaskEx[] : [];
  const phaseParentNames = new Set(['operational brief', 'design', 'project control', 'project management team', 'handover']);

  const parentById = new Map<string, string>();
  for (const task of rawTasks) {
    if (!task?.parent) {
      parentById.set(String(task.id), String(task.name || '').trim().toLowerCase());
    }
  }

  const phaseSubtasks = rawTasks.filter((task) => {
    if (!task?.parent) return false;
    return phaseParentNames.has(parentById.get(String(task.parent)) || '');
  });

  if (phaseSubtasks.length > 0) {
    const grouped = new Map<string, ClickUpTaskEx[]>();
    for (const task of phaseSubtasks) {
      const description = typeof task.description === 'string' ? task.description : undefined;
      const unit = (extractFieldFromText(description, 'Hotel Code') || extractFieldFromText(description, 'Unit') || inferUnitFromTask(task, description)).trim().toUpperCase();
      const projectName = (extractFieldFromText(description, 'Project Name') || String(task.name || '').replace(/^[A-Za-z]{2,5}\s*-\s*/, '').trim()).trim();
      const normalizedProjectName = normalizeProjectTitle(projectName);
      if (!normalizedProjectName) continue;
      const key = `${unit}::${normalizedProjectName}`;
      const list = grouped.get(key) || [];
      list.push(task);
      grouped.set(key, list);
    }

    const projects: CapexProject[] = [];
    for (const [key, tasks] of grouped.entries()) {
      const [unit] = key.split('::');
      const byParent = new Map<string, ClickUpTaskEx>();
      for (const task of tasks) {
        const parentName = parentById.get(String(task.parent));
        if (parentName && !byParent.has(parentName)) byParent.set(parentName, task);
      }

      const sample = tasks[0];
      const sampleDescription = typeof sample.description === 'string' ? sample.description : undefined;
      const projectName = extractFieldFromText(sampleDescription, 'Project Name') || String(sample.name || '').replace(/^[A-Za-z]{2,5}\s*-\s*/, '').trim();

      const briefTask = byParent.get('operational brief');
      const designTask = byParent.get('design');
      const controlTask = byParent.get('project control');
      const pmTask = byParent.get('project management team');
      const handoverTask = byParent.get('handover');

      const getDesc = (task?: ClickUpTaskEx) => typeof task?.description === 'string' ? task.description : undefined;
      const milestones: CapexMilestones = {
        briefDate: extractFieldFromText(getDesc(briefTask), 'Received Date') || extractFieldFromText(getDesc(briefTask), 'Brief Date') || extractFieldFromText(getDesc(briefTask), 'Operational Brief Date') || undefined,
        designDate: extractFieldFromText(getDesc(designTask), 'Start Design Date') || extractFieldFromText(getDesc(designTask), 'Design Date') || undefined,
        controlDate: extractFieldFromText(getDesc(controlTask), 'Tender Start') || extractFieldFromText(getDesc(controlTask), 'APS Release Date') || extractFieldFromText(getDesc(controlTask), 'APS = SPK Released (+3 weeks)') || extractFieldFromText(getDesc(controlTask), 'SPK Released') || undefined,
        projectManagementDate: extractFieldFromText(getDesc(pmTask), 'Commence Date') || undefined,
        handoverDate: extractFieldFromText(getDesc(handoverTask), 'BAST-1') || extractFieldFromText(getDesc(handoverTask), 'Bast 1') || extractFieldFromText(getDesc(handoverTask), 'BAST-2') || extractFieldFromText(getDesc(handoverTask), 'Bast 2') || undefined,
      };

      const pmDesc = getDesc(pmTask);
      const progressRaw = extractFieldFromText(pmDesc, 'Current Site Progress') || extractFieldFromText(getDesc(sample), 'Progress');
      const progress = typeof progressRaw === 'string' ? extractPercent(progressRaw) : undefined;

      const status = pmTask ? 'PROJECT_MANAGEMENT' : controlTask ? 'CONTROL' : designTask ? 'DESIGN' : briefTask ? 'BRIEF' : handoverTask ? 'HANDOVER' : 'OPEN';
      const phase = resolvePhase({ status, progress, milestones, explicitPhase: undefined, isExecution: isGanttExecution(projectName, sample.name, milestones) });
      const note = extractFieldFromText(pmDesc, 'Current Site Progress')
        || extractFieldFromText(briefTask ? getDesc(briefTask) : undefined, 'Brief')
        || extractFieldFromText(controlTask ? getDesc(controlTask) : undefined, 'Contract Amount')
        || undefined;

      const actualCompletion = extractFieldFromText(pmDesc, 'Actual Completion');
      const hasActualCompletionDate = isValidMilestoneDate(actualCompletion);
      const start = milestones.projectManagementDate || milestones.controlDate || milestones.designDate || milestones.briefDate;
      const end = (hasActualCompletionDate ? actualCompletion : undefined)
        || extractFieldFromText(pmDesc, 'End Contract')
        || milestones.handoverDate;

      projects.push({
        id: `clickup-phase:${unit}:${normalizeProjectTitle(projectName)}`,
        unit,
        hotelCode: unit,
        name: projectName,
        start,
        end,
        status,
        progress,
        note,
        pic: undefined,
        nextAction: undefined,
        url: sample.url,
        phase,
        isExecution: isGanttExecution(projectName, sample.name, milestones),
        deadlineRisk: getDeadlineRisk(end),
        blocked: phase === 'blocked',
        milestones,
        source: 'clickup',
      });
    }

    return projects.sort((a, b) => {
      const unitCmp = String(a.hotelCode || a.unit).localeCompare(String(b.hotelCode || b.unit));
      if (unitCmp !== 0) return unitCmp;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  const tasks = rawTasks.filter((task) => {
    const name = String(task?.name || '').trim().toLowerCase();
    const description = typeof task?.description === 'string' ? task.description : '';
    if (phaseParentNames.has(name)) return false;
    if (description.includes('phase parent for CAPEX Gantt 2026')) return false;
    if (description.includes('phase parent for pilot SPH sync')) return false;
    if (description.includes('Source Key:') || description.includes('Project Name:')) return false;
    return true;
  });
  const seedRows = await loadCapexSeedRows();
  const mappingSeed = await loadMappingSeed();
  const mappingByNo = new Map(mappingSeed.map((row) => [row.no, row]));
  const taskByName = new Map(tasks.map((task) => [String(task.name || '').trim().toLowerCase(), task]));
  const tasksByNormalizedProjectName = new Map<string, ClickUpTaskEx[]>();
  for (const task of tasks) {
    const description = typeof task.description === 'string' ? task.description : undefined;
    const projectName = extractFieldFromText(description, 'Project Name') || String(task.name || '');
    const normalized = normalizeProjectTitle(projectName);
    if (!normalized) continue;
    const list = tasksByNormalizedProjectName.get(normalized) || [];
    list.push(task);
    tasksByNormalizedProjectName.set(normalized, list);
  }
  const usedTaskIds = new Set<string>();

  const seededProjects = seedRows.map((seedRow) => {
    const seedMapping = mappingByNo.get(seedRow.no);
    const normalizedSeedName = normalizeProjectTitle(seedRow.name);
    const normalizedMatches = tasksByNormalizedProjectName.get(normalizedSeedName) || [];
    const matchedTask = seedMapping?.clickupTaskId
      ? tasks.find((task) => String(task.id) === String(seedMapping.clickupTaskId))
      : normalizedMatches[0] || taskByName.get(seedRow.name.trim().toLowerCase()) || tasks.find((task) => String(task.name || '').trim().toLowerCase().includes(seedRow.name.trim().toLowerCase()));

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

  const dedupedAdditional = additionalClickUpProjects.filter((project, index, list) => {
    const key = `${String(project.hotelCode || project.unit || '').toUpperCase()}::${String(project.name || '').trim().toLowerCase()}`;
    return index === list.findIndex((item) => `${String(item.hotelCode || item.unit || '').toUpperCase()}::${String(item.name || '').trim().toLowerCase()}` === key);
  });

  return [...seededProjects, ...dedupedAdditional];
}
