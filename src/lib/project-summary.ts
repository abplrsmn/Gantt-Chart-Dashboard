import { getDbPool } from './db';

export interface ProjectPhaseSummary {
  phase_id: number;
  project_id: number;
  project_name: string;
  unit_name: string | null;
  unit_code: string | null;
  phase_name: string | null;
  overall_status: string | null;
  brief_text: string | null;
  budget_capex: number | null;
  commence_date: string | null;
  current_site_progress: string | null;
  effective_deadline: string | null;
  actual_phase_completion_date: string | null;
  days_to_deadline?: number | null;
  days_overdue?: number | null;
}

export interface SummaryBuckets {
  generatedAt: string;
  counts: {
    onProgress: number;
    nearDeadline: number;
    overdue: number;
  };
  onProgress: ProjectPhaseSummary[];
  nearDeadline: ProjectPhaseSummary[];
  overdue: ProjectPhaseSummary[];
}

export async function getDailyProjectSummary(): Promise<SummaryBuckets> {
  const pool = getDbPool();

  const query = `
    WITH base_phases AS (
        SELECT 
            pp.id as phase_id,
            p.id as project_id,
            p.project_name,
            mu.unit_name,
            mu.unit_code,
            mp.phase_name,
            ms.status_label as overall_status,
            pp.brief_text,
            pp.budget_capex,
            pp.commence_date,
            pp.current_site_progress,
            COALESCE(pp.end_contract_date, pp.normalized_deadline_date, p.target_deadline_date) as effective_deadline,
            pp.actual_phase_completion_date
        FROM project_phases pp
        JOIN projects p ON p.id = pp.project_id
        LEFT JOIN master_units mu ON mu.id = p.unit_id
        LEFT JOIN master_phases mp ON mp.id = pp.phase_id
        LEFT JOIN master_statuses ms ON ms.id = p.overall_status_id
        WHERE pp.actual_phase_completion_date IS NULL
    )
    SELECT * 
    FROM base_phases
    ORDER BY effective_deadline ASC NULLS LAST
  `;

  const result = await pool.query(query);
  const rows = result.rows;

  const now = new Date();
  // Strip time for proper date comparisons
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const in7Days = new Date(today);
  in7Days.setDate(today.getDate() + 7);

  const onProgress: ProjectPhaseSummary[] = [];
  const nearDeadline: ProjectPhaseSummary[] = [];
  const overdue: ProjectPhaseSummary[] = [];

  const msPerDay = 1000 * 60 * 60 * 24;

  for (const row of rows) {
    const hasActivitySignal = 
        row.commence_date !== null || 
        row.current_site_progress !== null || 
        row.effective_deadline !== null;

    let isNearDeadline = false;
    let isOverdue = false;

    row.days_to_deadline = null;
    row.days_overdue = null;

    if (row.effective_deadline) {
        const deadlineDate = new Date(row.effective_deadline);
        const deadlineDateOnly = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
        
        const diffDays = Math.floor((deadlineDateOnly.getTime() - today.getTime()) / msPerDay);

        if (diffDays < 0) {
            isOverdue = true;
            row.days_overdue = Math.abs(diffDays);
        } else if (diffDays >= 0 && diffDays <= 7) {
            isNearDeadline = true;
            row.days_to_deadline = diffDays;
        }

        // Tweak: Exclude 'Operational Brief' from overdue & nearDeadline to reduce chat noise
        if (row.phase_name === 'Operational Brief') {
            isNearDeadline = false;
            isOverdue = false;
        }
    }

    if (isOverdue) {
        overdue.push(row);
    } else if (isNearDeadline) {
        nearDeadline.push(row);
    } else if (hasActivitySignal) {
        onProgress.push(row);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      onProgress: onProgress.length,
      nearDeadline: nearDeadline.length,
      overdue: overdue.length,
    },
    onProgress,
    nearDeadline,
    overdue
  };
}
