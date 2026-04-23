import path from 'path';
import { promises as fs } from 'fs';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const SUMMARY_PATH = path.join(process.cwd(), 'data', 'capex-summary.normalized.json');

const PHASE_PARENT_NAMES = [
  'Operational Brief',
  'Design',
  'Project Control',
  'Project Management Team',
  'Handover',
] as const;

type SummaryRow = {
  hotelCode?: string;
  projectName?: string;
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
  currentSiteProgress?: string | number | null;
  remarks?: string | null;
  bast1?: string | null;
  bast2?: string | null;
  sourceKey?: string | null;
};

function normalize(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

function asText(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function fmt(value: unknown) {
  const text = asText(value);
  return text || '-';
}

function phaseDescription(phase: string, row: SummaryRow) {
  const unit = asText(row.hotelCode).toUpperCase() || 'UNKNOWN';
  const project = asText(row.projectName);
  const sourceKey = asText(row.sourceKey);

  const lines = [
    `Source Key: ${fmt(sourceKey)}`,
    `Hotel Code: ${fmt(unit)}`,
    `Project Name: ${fmt(project)}`,
  ];

  if (phase === 'Operational Brief') {
    lines.push(`Brief: ${fmt(row.description)}`);
    lines.push(`Received Date: ${fmt(row.receivedDate)}`);
    lines.push(`Budget/CAPEX: ${fmt(row.budgetCapex)}`);
  } else if (phase === 'Design') {
    lines.push(`Start Design Date: ${fmt(row.startDesignDate)}`);
    lines.push(`Design Approval (+1 month): ${fmt(row.designApproval)}`);
    lines.push(`Duration : delay(-) / +: ${fmt(row.designDelayDays)}`);
    lines.push(`Brief: ${fmt(row.briefNote)}`);
    lines.push(`Working Drawing (+3 weeks): ${fmt(row.workingDrawingDate)}`);
  } else if (phase === 'Project Control') {
    lines.push(`Tender Start: ${fmt(row.tenderStart)}`);
    lines.push(`APS = SPK Released (+3 weeks): ${fmt(row.apsReleaseDate)}`);
    lines.push(`Duration : delay(-) / +: ${fmt(row.tenderDelayDays)}`);
    lines.push(`Contract Amount: ${fmt(row.contractAmount)}`);
  } else if (phase === 'Project Management Team') {
    lines.push(`Commence Date: ${fmt(row.commenceDate)}`);
    lines.push(`End Contract: ${fmt(row.endContract)}`);
    lines.push(`Actual Completion: ${fmt(row.actualCompletion)}`);
    lines.push(`deviation : delay(-) / +: ${fmt(row.deviationDays)}`);
    lines.push(`Current Site Progress: ${fmt(row.currentSiteProgress)}`);
    lines.push(`Remarks: ${fmt(row.remarks)}`);
  } else if (phase === 'Handover') {
    lines.push(`BAST-1: ${fmt(row.bast1)}`);
    lines.push(`BAST-2: ${fmt(row.bast2)}`);
  }

  return lines.join('\n');
}

async function loadRows(): Promise<SummaryRow[]> {
  const raw = await fs.readFile(SUMMARY_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { projects?: SummaryRow[] };
  const rows = Array.isArray(parsed.projects) ? parsed.projects : [];
  return rows.filter((row) => asText(row.projectName));
}

async function getListWithTasks() {
  const target = await resolveAnyTargetListByName({ listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME, candidates: [TARGET_LIST_NAME] });
  const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  return { target, tasks };
}

async function ensureParent(listId: string, existingTasks: any[], name: string) {
  const found = existingTasks.find((task) => normalize(task?.name) === normalize(name) && !task?.parent);
  if (found) return { task: found, created: false };

  const created = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: `${name} phase parent for CAPEX Gantt 2026`,
      notify_all: false,
    }),
  });

  return { task: created, created: true };
}

async function ensureSubtask(parentId: string, row: SummaryRow, phaseName: string, existingSubtasks: any[]) {
  const projectName = asText(row.projectName);
  const sourceKey = asText(row.sourceKey);
  const desiredName = `${asText(row.hotelCode).toUpperCase()} - ${projectName}`;
  const desiredDescription = phaseDescription(phaseName, row);

  const found = existingSubtasks.find((task) => {
    const desc = asText(task?.description);
    return normalize(task?.name) === normalize(desiredName)
      || (sourceKey && desc.includes(`Source Key: ${sourceKey}`));
  });

  if (found) {
    const updated = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${found.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: desiredName,
        description: desiredDescription,
      }),
    });
    return { task: updated, created: false, updated: true };
  }

  const target = await resolveAnyTargetListByName({ listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME, candidates: [TARGET_LIST_NAME] });
  const created = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task`, {
    method: 'POST',
    body: JSON.stringify({
      name: desiredName,
      description: desiredDescription,
      notify_all: false,
      parent: parentId,
    }),
  });

  return { task: created, created: true, updated: false };
}

export async function syncCapexPhaseStructure() {
  const rows = await loadRows();
  const { target, tasks } = await getListWithTasks();

  const parentResults: Array<{ phase: string; id: string; created: boolean }> = [];
  const subtaskResults: Array<{ phase: string; projectName: string; created: boolean; updated: boolean }> = [];

  for (const phaseName of PHASE_PARENT_NAMES) {
    const ensuredParent = await ensureParent(target.listId, tasks, phaseName);
    const parent = ensuredParent.task;
    parentResults.push({ phase: phaseName, id: String(parent.id), created: ensuredParent.created });

    const refreshedParent = ensuredParent.created
      ? await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${parent.id}`)
      : parent;

    const subtasks = Array.isArray(refreshedParent?.subtasks) ? refreshedParent.subtasks : [];

    for (const row of rows) {
      const result = await ensureSubtask(String(parent.id), row, phaseName, subtasks);
      subtaskResults.push({
        phase: phaseName,
        projectName: asText(row.projectName),
        created: result.created,
        updated: result.updated,
      });
    }
  }

  return {
    success: true,
    target,
    parents: parentResults,
    subtasks: {
      total: subtaskResults.length,
      created: subtaskResults.filter((r) => r.created).length,
      updated: subtaskResults.filter((r) => r.updated).length,
    },
  };
}
