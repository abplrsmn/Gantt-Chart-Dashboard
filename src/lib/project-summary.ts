import { getDbPool } from './db';
import { CLICKUP_API_BASE_URL, fetchClickUp } from '@/lib/clickup-target';

export interface ProjectManagementSummaryRow {
  phase_id: number;
  project_id: number;
  project_name: string;
  unit_name: string | null;
  unit_code: string | null;
  phase_name: string | null;
  overall_status: string | null;
  clickup_task_id?: string | null;
  project_start_date?: string | null;
  project_end_date?: string | null;
  commence_date: string | null;
  end_contract_date: string | null;
  actual_phase_completion_date: string | null;
  current_site_progress: string | null;
  bast_1_date?: string | null;
  bast_2_date?: string | null;
  phase_windows?: Array<{
    phase_name: string | null;
    phase_order: number | null;
    start_date: string | null;
    end_date: string | null;
  }> | null;
  days_remaining?: number | null;
  days_overdue?: number | null;
  completion_delta_days?: number | null;
}

export interface SummaryBuckets {
  generatedAt: string;
  counts: {
    handover: number;
    inProgress: number;
    nearDeadline: number;
    overdue: number;
  };
  handover: ProjectManagementSummaryRow[];
  inProgress: ProjectManagementSummaryRow[];
  nearDeadline: ProjectManagementSummaryRow[];
  overdue: ProjectManagementSummaryRow[];
}

function extractFieldFromDescription(description: string | undefined, label: string) {
  if (!description) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}:\\s*(.+)`, 'i');
  const match = description.match(regex);
  return match?.[1]?.trim();
}

function normalizeDescriptionValue(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === '-' || text.toLowerCase() === 'null') return null;
  return text;
}

function normalizeDateValue(value?: string | null) {
  const text = normalizeDescriptionValue(value);
  if (!text) return null;
  return text;
}

async function enrichFromClickUpDescription(rows: ProjectManagementSummaryRow[]) {
  const targets = rows.filter(
    (row) =>
      row.clickup_task_id &&
      (!row.commence_date || !row.end_contract_date || !row.actual_phase_completion_date || !row.current_site_progress)
  );

  for (const row of targets) {
    try {
      const task = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${row.clickup_task_id}`);
      const description = typeof task?.description === 'string' ? task.description : undefined;
      if (!description) continue;

      if (!row.commence_date) {
        row.commence_date = normalizeDateValue(extractFieldFromDescription(description, 'Commence Date'));
      }
      if (!row.end_contract_date) {
        row.end_contract_date = normalizeDateValue(extractFieldFromDescription(description, 'End Contract'));
      }
      if (!row.actual_phase_completion_date) {
        const actualValue = normalizeDateValue(extractFieldFromDescription(description, 'Actual Completion'));
        row.actual_phase_completion_date = actualValue;
      }
      if (!row.current_site_progress) {
        row.current_site_progress = normalizeDescriptionValue(extractFieldFromDescription(description, 'Current Site Progress'));
      }
    } catch (error) {
      console.error(`Failed to enrich PM row from ClickUp for task ${row.clickup_task_id}:`, error);
    }
  }
}

export async function getDailyProjectSummary(): Promise<SummaryBuckets> {
  const pool = getDbPool();

  const query = `
    SELECT
      pp.id as phase_id,
      p.id as project_id,
      p.project_name,
      mu.unit_name,
      mu.unit_code,
      mp.phase_name,
      ms.status_label as overall_status,
      pp.clickup_task_id,
      p.start_date as project_start_date,
      p.end_date as project_end_date,
      pp.commence_date,
      pp.end_contract_date,
      pp.actual_phase_completion_date,
      pp.current_site_progress,
      ho.bast_1_date,
      ho.bast_2_date,
      COALESCE(phase_windows.phase_windows, '[]'::json) as phase_windows
    FROM project_phases pp
    JOIN projects p ON p.id = pp.project_id
    LEFT JOIN master_units mu ON mu.id = p.unit_id
    LEFT JOIN master_phases mp ON mp.id = pp.phase_id
    LEFT JOIN master_statuses ms ON ms.id = p.overall_status_id
    LEFT JOIN project_phases ho ON ho.project_id = p.id
      AND ho.phase_id = (SELECT id FROM master_phases WHERE phase_name = 'Handover' LIMIT 1)
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'phase_name', mp_all.phase_name,
          'phase_order', mp_all.phase_order,
          'start_date', CASE
            WHEN mp_all.phase_name = 'Operational Brief' THEN pp_all.received_date
            WHEN mp_all.phase_name = 'Design' THEN pp_all.start_design_date
            WHEN mp_all.phase_name = 'Project Control' THEN pp_all.tender_start_date
            WHEN mp_all.phase_name = 'Project Management' THEN pp_all.commence_date
            WHEN mp_all.phase_name = 'Handover' THEN COALESCE(pp_all.bast_1_date, pp_all.bast_2_date)
            ELSE pp_all.normalized_deadline_date
          END,
          'end_date', CASE
            WHEN mp_all.phase_name = 'Operational Brief' THEN COALESCE(pp_all.normalized_deadline_date, pp_all.received_date)
            WHEN mp_all.phase_name = 'Design' THEN COALESCE(pp_all.design_approval_date, pp_all.normalized_deadline_date)
            WHEN mp_all.phase_name = 'Project Control' THEN COALESCE(pp_all.aps_spk_released_date, pp_all.normalized_deadline_date)
            WHEN mp_all.phase_name = 'Project Management' THEN COALESCE(pp_all.end_contract_date, pp_all.actual_phase_completion_date, pp_all.normalized_deadline_date)
            WHEN mp_all.phase_name = 'Handover' THEN COALESCE(pp_all.bast_2_date, pp_all.bast_1_date, pp_all.normalized_deadline_date)
            ELSE pp_all.normalized_deadline_date
          END
        ) ORDER BY mp_all.phase_order ASC
      ) as phase_windows
      FROM project_phases pp_all
      JOIN master_phases mp_all ON mp_all.id = pp_all.phase_id
      WHERE pp_all.project_id = p.id
    ) phase_windows ON true
    WHERE mp.phase_name = 'Project Management'
    ORDER BY mu.unit_code ASC NULLS LAST, p.project_name ASC;
  `;

  const result = await pool.query(query);
  const rows = result.rows as ProjectManagementSummaryRow[];
  await enrichFromClickUpDescription(rows);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;

  const handover: ProjectManagementSummaryRow[] = [];
  const inProgress: ProjectManagementSummaryRow[] = [];
  const nearDeadline: ProjectManagementSummaryRow[] = [];
  const overdue: ProjectManagementSummaryRow[] = [];

  for (const row of rows) {
    row.days_remaining = null;
    row.days_overdue = null;
    row.completion_delta_days = null;

    const endContract = row.end_contract_date ? new Date(row.end_contract_date) : null;
    const actualCompletion = row.actual_phase_completion_date ? new Date(row.actual_phase_completion_date) : null;

    const endContractOnly = endContract && !Number.isNaN(endContract.getTime())
      ? new Date(endContract.getFullYear(), endContract.getMonth(), endContract.getDate())
      : null;
    const actualCompletionOnly = actualCompletion && !Number.isNaN(actualCompletion.getTime())
      ? new Date(actualCompletion.getFullYear(), actualCompletion.getMonth(), actualCompletion.getDate())
      : null;

    if (actualCompletionOnly && endContractOnly) {
      row.completion_delta_days = Math.floor((actualCompletionOnly.getTime() - endContractOnly.getTime()) / msPerDay);
    }

    const progressText = String(row.current_site_progress || '').toLowerCase();
    const isAborted = progressText.includes('aborted');
    if (isAborted) {
      continue;
    }

    const isHandover = !!(row.bast_1_date || row.bast_2_date);
    if (isHandover) {
      handover.push(row);
      continue;
    }

    if (endContractOnly) {
      const diffDays = Math.floor((endContractOnly.getTime() - today.getTime()) / msPerDay);
      row.days_remaining = diffDays;

      if (diffDays >= 0 && diffDays <= 7) {
        nearDeadline.push(row);
      }
    }

    if (row.commence_date || row.end_contract_date || row.current_site_progress || row.actual_phase_completion_date) {
      inProgress.push(row);
    }
  }

  inProgress.sort((a, b) => (a.days_remaining ?? Number.MAX_SAFE_INTEGER) - (b.days_remaining ?? Number.MAX_SAFE_INTEGER));
  nearDeadline.sort((a, b) => (a.days_remaining ?? Number.MAX_SAFE_INTEGER) - (b.days_remaining ?? Number.MAX_SAFE_INTEGER));
  handover.sort((a, b) => {
    const aDate = a.bast_1_date ? new Date(a.bast_1_date).getTime() : 0;
    const bDate = b.bast_1_date ? new Date(b.bast_1_date).getTime() : 0;
    return bDate - aDate;
  });

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      handover: handover.length,
      inProgress: inProgress.length,
      nearDeadline: nearDeadline.length,
      overdue: overdue.length,
    },
    handover,
    inProgress,
    nearDeadline,
    overdue,
  };
}
