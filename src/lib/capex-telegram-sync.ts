import { promises as fs } from 'fs';
import path from 'path';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';
import { resolveAssigneeId } from '@/lib/clickup-write';
import { getDbPool } from '@/lib/db';

const TARGET_SPACE_NAME = (process.env.CAPEX_TARGET_SPACE_NAME || 'Project').trim();
const TARGET_LIST_NAME = (process.env.CAPEX_TARGET_LIST_NAME || 'CAPEX Gantt 2026').trim();
const TARGET_LIST_CANDIDATES = [
  TARGET_LIST_NAME,
  'CAPEX Gantt',
  'CAPEX',
  'CAPEX Gantt 2025',
  'CAPEX Gantt 2024',
];
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'capex-summary.normalized.json');

type CapexSyncInput = {
  mode?: 'create' | 'update' | 'upsert';
  unit?: string;
  project?: string;
  description?: string;
  commenceDate?: string;
  endContract?: string;
  budgetCapex?: number | string;
  contractAmount?: number | string;
  remarks?: string;
  currentSiteProgress?: number | string;
  receivedDate?: string;
  startDesignDate?: string;
  tenderStart?: string;
  spkReleased?: string;
  actualCompletion?: string;
  assignee?: string;
};

type ProjectAuditInput = {
  unit: string;
  project: string;
  phase: string;
  action: 'created' | 'updated';
  normalized: Record<string, unknown>;
  changedBy?: string;
};

type ClickUpTaskLite = {
  id: string;
  name?: string;
  url?: string;
  description?: string;
  due_date?: string;
  start_date?: string;
  status?: { status?: string };
  custom_fields?: Array<{ id?: string; name?: string; type?: string; type_config?: any; value?: any }>;
};

type SummaryProject = {
  sourceRow?: number;
  hotelCode?: string;
  projectName?: string;
  description?: string | null;
  taskName?: string;
  sourceKey?: string;
};

function normalizeText(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9%\s&/:-]+/g, ' ')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

function normalizeTaskName(unit?: string, project?: string) {
  const cleanUnit = String(unit || '').trim().toUpperCase();
  const cleanProject = String(project || '').trim();
  if (!cleanUnit) return cleanProject;
  if (!cleanProject) return cleanUnit;
  return `${cleanUnit} - ${cleanProject}`;
}

function pad2(value: string | number) {
  return String(value).padStart(2, '0');
}

function normalizeDateInput(input?: string) {
  if (!input) return undefined;
  const text = String(input).trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${pad2(dmy[2])}-${pad2(dmy[1])}`;

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

  return undefined;
}

function dateToJakartaEndMs(input?: string) {
  const iso = normalizeDateInput(input);
  if (!iso) return undefined;
  return new Date(`${iso}T23:59:00+07:00`).getTime();
}

function dateToJakartaStartMs(input?: string) {
  const iso = normalizeDateInput(input);
  if (!iso) return undefined;
  return new Date(`${iso}T00:00:00+07:00`).getTime();
}

function formatIsoForTelegram(input?: string) {
  const iso = normalizeDateInput(input);
  return iso || '-';
}

function normalizeProgress(input: unknown): number | undefined {
  if (input === null || input === undefined || input === '') return undefined;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return undefined;

  if (/(^|\b)(done|complete|completed|finish|finished|100% onsite|full)\b/.test(raw)) {
    return 100;
  }

  const percentMatch = raw.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  if (percentMatch) {
    const num = Number(percentMatch[1].replace(',', '.'));
    if (Number.isFinite(num)) return Math.max(0, Math.min(100, Math.round(num)));
  }

  const num = Number(raw.replace(',', '.').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return undefined;
  if (num === 1) return 100;
  if (num === 0) return 0;
  if (num > 0 && num < 1) return Math.max(0, Math.min(100, Math.round(num * 100)));
  return Math.max(0, Math.min(100, Math.round(num)));
}

function computePhase(input: {
  progress?: number;
  receivedDate?: string;
  startDesignDate?: string;
  tenderStart?: string;
  spkReleased?: string;
  commenceDate?: string;
  actualCompletion?: string;
}) {
  if ((input.progress ?? 0) >= 100 || input.actualCompletion) return 'Completed';
  if (input.commenceDate && (input.progress ?? 0) < 100) return 'Project Management';
  if (input.tenderStart || input.spkReleased) return 'Project Control';
  if (input.startDesignDate) return 'Design';
  if (input.receivedDate) return 'Operational Brief';
  return 'Operational Brief';
}

function computeDeviationDays(endContract?: string, actualCompletion?: string) {
  const end = normalizeDateInput(endContract);
  if (!end) return undefined;
  const actual = normalizeDateInput(actualCompletion) || new Date().toISOString().slice(0, 10);
  const endMs = new Date(`${end}T00:00:00+07:00`).getTime();
  const actualMs = new Date(`${actual}T00:00:00+07:00`).getTime();
  if (!Number.isFinite(endMs) || !Number.isFinite(actualMs)) return undefined;
  return Math.round((actualMs - endMs) / 86400000);
}

function withDeviationRemark(baseRemarks: string | undefined, deviationDays: number | undefined) {
  const parts = [String(baseRemarks || '').trim()].filter(Boolean);
  if (typeof deviationDays === 'number' && deviationDays > 0) {
    parts.push(`Delayed by ${deviationDays} day(s) past End Contract.`);
  }
  return parts.join(' | ');
}

function extractFieldFromDescription(description: string | undefined, label: string) {
  if (!description) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}:\\s*(.+)`, 'i');
  const match = description.match(regex);
  return match?.[1]?.trim();
}

function extractSourceKey(description?: string) {
  if (!description) return undefined;
  const sourceKey = extractFieldFromDescription(description, 'Source Key');
  if (sourceKey) return sourceKey;
  const match = description.match(/(SUMMARYSYNC::[^\n]+|CAPEXSYNC::[^\n]+)/i);
  return match?.[1]?.split('::')?.[1]?.trim();
}

function projectAliases(unit: string, project: string, summaryRow?: SummaryProject | null) {
  const variants = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = normalizeText(value);
    if (normalized) variants.add(normalized);
  };

  add(project);
  add(normalizeTaskName(unit, project));
  add(summaryRow?.projectName);
  add(summaryRow?.taskName);
  add(summaryRow?.description || undefined);

  const bareProject = String(project || '').replace(/^([A-Z]{2,5})\s*[-:|]\s*/i, '').trim();
  add(bareProject);

  return Array.from(variants);
}

async function loadSummaryProjects(): Promise<SummaryProject[]> {
  try {
    const raw = await fs.readFile(SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { projects?: SummaryProject[] };
    return Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function findSummaryRow(unit: string, project: string, rows: SummaryProject[]) {
  const normalizedUnit = normalizeText(unit);
  const aliases = projectAliases(unit, project);

  const scored = rows
    .map((row) => {
      const rowUnit = normalizeText(row.hotelCode);
      const rowProject = normalizeText(row.projectName);
      const rowTaskName = normalizeText(row.taskName);
      const rowDescription = normalizeText(row.description || undefined);
      let score = 0;

      if (rowUnit === normalizedUnit) score += 50;
      if (aliases.includes(rowProject)) score += 100;
      if (aliases.includes(rowTaskName)) score += 85;
      if (aliases.some((alias) => rowProject.includes(alias) || alias.includes(rowProject))) score += 35;
      if (aliases.some((alias) => rowTaskName.includes(alias) || alias.includes(rowTaskName))) score += 25;
      if (aliases.some((alias) => rowDescription.includes(alias))) score += 10;

      return { row, score };
    })
    .filter((entry) => entry.score >= 80)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.row || null;
}

function inferTaskMatchScore(task: ClickUpTaskLite, unit: string, project: string, summaryRow?: SummaryProject | null) {
  const normalizedUnit = normalizeText(unit);
  const aliases = projectAliases(unit, project, summaryRow);
  const normalizedName = normalizeText(task.name);
  const normalizedDesc = normalizeText(task.description);
  const sourceKey = extractSourceKey(task.description);
  let score = 0;

  if (summaryRow?.sourceKey && sourceKey === summaryRow.sourceKey) score += 300;
  if (normalizedName === normalizeText(normalizeTaskName(unit, project))) score += 120;
  if (aliases.some((alias) => normalizedName === alias)) score += 110;
  if (aliases.some((alias) => normalizedName.includes(alias))) score += 60;
  if (aliases.some((alias) => normalizedDesc.includes(alias))) score += 40;
  if (normalizedName.includes(normalizedUnit)) score += 25;
  if (normalizedDesc.includes(`unit ${normalizedUnit}`)) score += 20;
  if (normalizeText(extractFieldFromDescription(task.description, 'Unit')) === normalizedUnit) score += 25;
  if (aliases.includes(normalizeText(extractFieldFromDescription(task.description, 'Project Name')))) score += 50;
  return score;
}

async function resolveCapexList() {
  return resolveAnyTargetListByName({
    listName: TARGET_LIST_NAME,
    candidates: TARGET_LIST_CANDIDATES,
    spaceName: TARGET_SPACE_NAME,
  });
}

async function getListTasks(listId: string): Promise<ClickUpTaskLite[]> {
  const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${listId}/task?include_closed=true&subtasks=true`);
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function findBestExistingTask(tasks: ClickUpTaskLite[], input: CapexSyncInput, summaryRow?: SummaryProject | null) {
  const unit = String(input.unit || '').trim().toUpperCase();
  const project = String(input.project || input.description || '').trim();
  if (!unit || !project) return null;

  const ranked = tasks
    .map((task) => ({ task, score: inferTaskMatchScore(task, unit, project, summaryRow) }))
    .filter((entry) => entry.score >= 80)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.task || null;
}

async function appendProjectAuditLog(input: ProjectAuditInput) {
  let client;
  try {
    const pool = getDbPool();
    client = await pool.connect();
    const unit = input.unit.trim().toUpperCase();
    const project = input.project.trim();
    const normalizedProject = normalizeText(project);
    const normalizedWithUnit = normalizeText(normalizeTaskName(unit, project));

    const projectRes = await client.query(
      `SELECT p.id, p.project_name
         FROM projects p
         LEFT JOIN master_units mu ON mu.id = p.unit_id
        WHERE UPPER(COALESCE(mu.unit_code, '')) = $1
          AND (
            LOWER(TRIM(p.project_name)) = LOWER(TRIM($2))
            OR LOWER(TRIM(p.project_name)) = LOWER(TRIM($3))
            OR regexp_replace(lower(p.project_name), '[^a-z0-9]+', ' ', 'g') = $4
            OR regexp_replace(lower(p.project_name), '[^a-z0-9]+', ' ', 'g') = $5
          )
        ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
        LIMIT 1`,
      [unit, project, normalizeTaskName(unit, project), normalizedProject, normalizedWithUnit]
    );

    const projectId = projectRes.rows[0]?.id;
    if (!projectId) return;

    await client.query(
      `INSERT INTO project_change_logs
         (project_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        projectId,
        `telegram_${input.phase.toLowerCase().replace(/\s+/g, '_')}`,
        null,
        JSON.stringify(input.normalized),
        `Project Team Telegram ${input.action} update for ${input.phase}`,
        input.changedBy || 'Project Team Telegram',
        'field_updated',
      ]
    );
  } catch (error) {
    console.error('Failed to append project change audit log:', error);
  } finally {
    client?.release();
  }
}

function resolveCustomFieldValue(field: any, value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (field?.type === 'currency' || field?.type === 'number') {
    const numeric = Number(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (field?.type === 'short_text' || field?.type === 'text') {
    return String(value);
  }
  if (field?.type === 'emoji' || field?.type === 'progress') {
    const numeric = normalizeProgress(value);
    return numeric;
  }
  return String(value);
}

function buildCustomFieldPayload(task: ClickUpTaskLite | null, input: CapexSyncInput, normalizedRemarks: string, normalizedProgress?: number) {
  const fields = Array.isArray(task?.custom_fields) ? task?.custom_fields : [];
  const desired: Record<string, unknown> = {
    'budget capex': input.budgetCapex,
    'contract amount': input.contractAmount,
    'remarks': normalizedRemarks,
    'current site progress': normalizedProgress,
    'progress': normalizedProgress,
  };

  return fields
    .map((field) => {
      const name = String(field?.name || '').trim().toLowerCase();
      const matchedKey = Object.keys(desired).find((key) => key === name);
      if (!matchedKey || !field?.id) return null;
      const value = resolveCustomFieldValue(field, desired[matchedKey]);
      if (value === undefined) return null;
      return { id: String(field.id), value };
    })
    .filter(Boolean);
}

function buildDescription(
  input: CapexSyncInput,
  phase: string,
  progress: number | undefined,
  normalizedRemarks: string,
  deviationDays: number | undefined,
  summaryRow?: SummaryProject | null
) {
  const lines = [
    summaryRow?.sourceKey ? `SUMMARYSYNC::${summaryRow.sourceKey}` : null,
    'SOURCE: TELEGRAM_CAPEX_SYNC',
    summaryRow?.sourceKey ? `Source Key: ${summaryRow.sourceKey}` : null,
    input.unit ? `Unit: ${String(input.unit).trim().toUpperCase()}` : null,
    input.project ? `Project Name: ${String(input.project).trim()}` : null,
    input.description ? `Description: ${String(input.description).trim()}` : null,
    input.commenceDate ? `Commence Date: ${formatIsoForTelegram(input.commenceDate)}` : null,
    input.endContract ? `End Contract: ${formatIsoForTelegram(input.endContract)}` : null,
    input.receivedDate ? `Received Date: ${formatIsoForTelegram(input.receivedDate)}` : null,
    input.startDesignDate ? `Start Design Date: ${formatIsoForTelegram(input.startDesignDate)}` : null,
    input.tenderStart ? `Tender Start: ${formatIsoForTelegram(input.tenderStart)}` : null,
    input.spkReleased ? `SPK Released: ${formatIsoForTelegram(input.spkReleased)}` : null,
    input.actualCompletion ? `Actual Completion: ${formatIsoForTelegram(input.actualCompletion)}` : null,
    input.budgetCapex !== undefined ? `Budget CAPEX: ${input.budgetCapex}` : null,
    input.contractAmount !== undefined ? `Contract Amount: ${input.contractAmount}` : null,
    progress !== undefined ? `Progress: ${progress}%` : null,
    `Phase: ${phase}`,
    normalizedRemarks ? `Remarks: ${normalizedRemarks}` : null,
    typeof deviationDays === 'number' ? `Deviation Days: ${deviationDays}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

function buildTelegramResponse(input: {
  unit: string;
  project: string;
  startDate?: string;
  dueDate?: string;
  phase: string;
  progress?: number;
  remarks?: string;
  delayed?: boolean;
}) {
  const lines = [
    '✅ Project Sync Success!',
    `* Unit: ${input.unit}`,
    `* Project: ${input.project}`,
    `* Timeline: ${input.startDate || '-'} s/d ${input.dueDate || '-'}`,
    `* Phase: ${input.phase}`,
    `* Progress: ${input.progress ?? 0}%`,
    `* Status Log: ${input.remarks || '-'}`,
    '* Gantt Chart: 🟢 *Synced & Live*',
  ];

  if (input.delayed) {
    lines.push('⚠️ ALERT: Proyek ini melewati batas End Contract. Mohon segera di-review!');
  }

  return lines.join('\n');
}

export async function syncCapexTelegramUpdate(input: CapexSyncInput) {
  const mode = input.mode || 'upsert';
  const unit = String(input.unit || '').trim().toUpperCase();
  const project = String(input.project || '').trim();

  if (!unit) throw new Error('unit is required');
  if (!project) throw new Error('project is required');

  const target = await resolveCapexList();
  const [tasks, summaryRows] = await Promise.all([
    getListTasks(target.listId),
    loadSummaryProjects(),
  ]);
  const summaryRow = findSummaryRow(unit, project, summaryRows);
  const existingTask = findBestExistingTask(tasks, input, summaryRow);

  if (mode === 'update' && !existingTask) {
    throw new Error(`Existing CAPEX project not found for ${unit} / ${project}`);
  }

  if (mode === 'create' && existingTask) {
    throw new Error(`CAPEX project already exists for ${unit} / ${project}`);
  }

  const progress = normalizeProgress(input.currentSiteProgress);
  const phase = computePhase({
    progress,
    receivedDate: input.receivedDate,
    startDesignDate: input.startDesignDate,
    tenderStart: input.tenderStart,
    spkReleased: input.spkReleased,
    commenceDate: input.commenceDate,
    actualCompletion: input.actualCompletion,
  });
  const deviationDays = computeDeviationDays(input.endContract, input.actualCompletion);
  const remarks = withDeviationRemark(input.remarks, deviationDays);
  const description = buildDescription(input, phase, progress, remarks, deviationDays, summaryRow);
  const assigneeId = await resolveAssigneeId(input.assignee);

  const basePayload: any = {
    name: normalizeTaskName(unit, project),
    description,
  };

  const dueDate = dateToJakartaEndMs(input.endContract);
  if (dueDate) basePayload.due_date = dueDate;

  const startDate = dateToJakartaStartMs(input.commenceDate);
  if (startDate) basePayload.start_date = startDate;

  if (assigneeId) {
    basePayload.assignees = [Number(assigneeId)];
  }

  const customFields = buildCustomFieldPayload(existingTask, input, remarks, progress);
  if (customFields.length > 0) {
    basePayload.custom_fields = customFields;
  }

  const result = existingTask
    ? await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${existingTask.id}`, {
        method: 'PUT',
        body: JSON.stringify(basePayload),
      })
    : await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task`, {
        method: 'POST',
        body: JSON.stringify({
          ...basePayload,
          notify_all: true,
        }),
      });

  const normalized = {
    unit,
    project,
    progress,
    phase,
    deviationDays,
    remarks,
  };

  await appendProjectAuditLog({
    unit,
    project,
    phase,
    action: existingTask ? 'updated' : 'created',
    normalized,
    changedBy: input.assignee,
  });

  return {
    success: true,
    action: existingTask ? 'updated' : 'created',
    task: result,
    target,
    matchedSummary: summaryRow
      ? {
          sourceKey: summaryRow.sourceKey || null,
          taskName: summaryRow.taskName || null,
          sourceRow: summaryRow.sourceRow || null,
        }
      : null,
    telegramMessage: buildTelegramResponse({
      unit,
      project,
      startDate: formatIsoForTelegram(input.commenceDate),
      dueDate: formatIsoForTelegram(input.endContract),
      phase,
      progress,
      remarks,
      delayed: typeof deviationDays === 'number' && deviationDays > 0,
    }),
    normalized,
  };
}
