import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { BUILTIN_PHASE_CODES_SQL } from "@/lib/phases";

export const dynamic = "force-dynamic";

/**
 * Phases added via Master Setup beyond the built-in five. They have no bespoke
 * columns, so they carry the generic phase_start_date / phase_end_date instead.
 * Aggregated as JSON so the number of phases stays dynamic — unlike the five
 * hardcoded LEFT JOINs below, which can't grow.
 */
const EXTRA_PHASES_JSON = `
  (
    SELECT COALESCE(json_agg(json_build_object(
             'phaseId',  xp.phase_id,
             'code',     xmp.phase_code,
             'name',     xmp.phase_name,
             'order',    xmp.phase_order,
             'start',    xp.phase_start_date,
             'end',      xp.phase_end_date,
             'progress', xp.progress_pct,
             'notes',    xp.notes
           ) ORDER BY xmp.phase_order, xmp.id), '[]'::json)
      FROM project_phases xp
      JOIN master_phases  xmp ON xmp.id = xp.phase_id
     WHERE xp.project_id = p.id
       AND xmp.phase_code NOT IN (${BUILTIN_PHASE_CODES_SQL})
  ) AS extra_phases
`;

export async function GET() {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    // This Gantt query joins several small lookup/phase tables. PostgreSQL's JIT
    // can dominate runtime for this kind of dashboard read (seconds vs ms),
    // so keep it off for the pooled session before running the query.
    await client.query("SET jit = off");
    try { await client.query(`ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS aps_date date`); } catch { /* already exists */ }
    try { await client.query(`ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS tender_finish_target date`); } catch { /* already exists */ }
    try { await client.query(`ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS contract_name varchar(255)`); } catch { /* already exists */ }

    const { rows } = await client.query(`
      WITH scurve_periods AS (
        SELECT
          pt.project_id,
          pp.period_order,
          pp.period_start,
          SUM(SUM(LEAST(GREATEST(pp.planned_weight, 0), COALESCE(pt.weight_pct, pp.planned_weight))))
            OVER (PARTITION BY pt.project_id ORDER BY pp.period_order, pp.period_start) AS target_progress,
          SUM(SUM(LEAST(GREATEST(pp.actual_weight, 0), COALESCE(pt.weight_pct, pp.actual_weight))))
            OVER (PARTITION BY pt.project_id ORDER BY pp.period_order, pp.period_start) AS actual_progress
        FROM project_task_progress_periods pp
        JOIN project_tasks pt ON pt.id = pp.project_task_id
        GROUP BY pt.project_id, pp.period_order, pp.period_start
      ),
      scurve_latest AS (
        SELECT DISTINCT ON (project_id)
          project_id,
          LEAST(100, target_progress)::numeric AS target_progress,
          LEAST(100, actual_progress)::numeric AS actual_progress,
          (LEAST(100, actual_progress) - LEAST(100, target_progress))::numeric AS progress_variance
        FROM scurve_periods
        -- Keep this aligned with /api/projects/[id]/scurve summary: use the final
        -- cumulative task-period values, not today's first/nearest period. The
        -- S-curve chart itself still shows every period point.
        ORDER BY project_id, period_order DESC, period_start DESC
      )
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.overall_progress_pct,
        p.blocker_note,
        p.next_action_note,
        sl.target_progress AS scurve_target_progress,
        sl.actual_progress AS scurve_actual_progress,
        sl.progress_variance AS scurve_progress_variance,
        p.start_date,
        p.end_date,
        mp_phase.phase_name   AS current_phase_name,
        mp_phase.phase_code   AS current_phase_code,
        ms.status_label       AS status_label,
        ms.color              AS status_color,
        mpr.priority_name,
        mpr.priority_code,
        mpr.color_hex         AS priority_color,
        mpr.level             AS priority_level,
        mu.unit_code,
        mu.unit_name,
        mc.category_code,
        mc.category_name,

        -- Phase-level dates from project_phases (one row per phase per project)
        ob.normalized_deadline_date   AS brief_deadline,
        ob.received_date              AS brief_received,
        ob.progress_pct               AS brief_progress,
        ob.brief_text                 AS operational_brief,
        ob.budget_capex               AS budget_capex,
        ob.notes                      AS brief_notes,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          LEFT JOIN master_people mp ON mp.id = pp.person_id
          WHERE pp.project_id = p.id
            AND (pp.phase_id = ob.id OR pp.phase_id = ob.phase_id)
            AND COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS brief_pic,

        ds.start_design_date          AS design_start,
        COALESCE(ds.design_approval_target, (ds.start_design_date + INTERVAL '1 month')::date) AS design_approval_target,
        ds.design_approval_date       AS design_end,
        ds.progress_pct               AS design_progress,
        ds.design_duration_days,
        ds.brief_text                 AS design_brief,
        ds.working_drawing_status,
        ds.notes                      AS design_notes,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          LEFT JOIN master_people mp ON mp.id = pp.person_id
          WHERE pp.project_id = p.id
            AND (pp.phase_id = ds.id OR pp.phase_id = ds.phase_id)
            AND COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS design_pic,

        pc.tender_start_date          AS control_start,
        COALESCE(pc.tender_finish_target, (pc.tender_start_date + INTERVAL '21 days')::date) AS aps_spk_target,
        pc.aps_spk_released_date      AS control_end,
        pc.aps_date                   AS aps_date,
        pc.progress_pct               AS control_progress,
        pc.project_control_duration_days,
        pc.phase_contract_amount,
        pc.notes                      AS control_notes,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          LEFT JOIN master_people mp ON mp.id = pp.person_id
          WHERE pp.project_id = p.id
            AND (pp.phase_id = pc.id OR pp.phase_id = pc.phase_id)
            AND COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS control_pic,

        pm.commence_date              AS pm_start,
        pm.end_contract_date          AS pm_end,
        pm.actual_phase_completion_date AS pm_actual_end,
        pm.deviation_days,
        GREATEST(0, (pm.end_contract_date - pm.commence_date))::int AS pm_duration_days,
        pm.progress_pct               AS pm_progress,
        pm.current_site_progress,
        pm.notes                      AS pm_remarks,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          LEFT JOIN master_people mp ON mp.id = pp.person_id
          WHERE pp.project_id = p.id
            AND (pp.phase_id = pm.id OR pp.phase_id = pm.phase_id)
            AND COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS pm_pic,

        hv.bast_1_date                AS handover_start,
        hv.bast_2_date                AS handover_end,
        hv.progress_pct               AS handover_progress,
        hv.actual_phase_completion_date,
        hv.notes                      AS handover_notes,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          LEFT JOIN master_people mp ON mp.id = pp.person_id
          WHERE pp.project_id = p.id
            AND (pp.phase_id = hv.id OR pp.phase_id = hv.phase_id)
            AND COALESCE(NULLIF(mp.full_name, ''), NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS handover_pic,

        -- Phase advance notes (from proceed-to-next-phase confirmation dialog)
        (SELECT SUBSTRING(cl.change_summary FROM POSITION(':' IN cl.change_summary) + 2)
         FROM project_change_logs cl
         WHERE cl.project_id = p.id AND cl.action_type = 'phase_advanced' AND cl.new_value = '2'
         ORDER BY cl.created_at DESC LIMIT 1) AS brief_advance_note,

        (SELECT SUBSTRING(cl.change_summary FROM POSITION(':' IN cl.change_summary) + 2)
         FROM project_change_logs cl
         WHERE cl.project_id = p.id AND cl.action_type = 'phase_advanced' AND cl.new_value = '3'
         ORDER BY cl.created_at DESC LIMIT 1) AS design_advance_note,

        pc.contract_name               AS contract_name,

        (SELECT SUBSTRING(cl.change_summary FROM POSITION(':' IN cl.change_summary) + 2)
         FROM project_change_logs cl
         WHERE cl.project_id = p.id AND cl.action_type = 'phase_advanced' AND cl.new_value = '4'
         ORDER BY cl.created_at DESC LIMIT 1) AS control_advance_note,

        (SELECT SUBSTRING(cl.change_summary FROM POSITION(':' IN cl.change_summary) + 2)
         FROM project_change_logs cl
         WHERE cl.project_id = p.id AND cl.action_type = 'phase_advanced' AND cl.new_value = '5'
         ORDER BY cl.created_at DESC LIMIT 1) AS pm_advance_note,

        ${EXTRA_PHASES_JSON}

      FROM projects p
      LEFT JOIN master_phases mp_phase       ON mp_phase.id = p.current_phase_id
      LEFT JOIN master_statuses ms           ON ms.id = p.overall_status_id
      LEFT JOIN master_priorities mpr        ON mpr.id = p.priority_id
      LEFT JOIN master_units mu              ON mu.id = p.unit_id
      LEFT JOIN master_project_categories mc ON mc.id = p.category_id
      LEFT JOIN scurve_latest sl            ON sl.project_id = p.id

      -- Join each phase row
      LEFT JOIN project_phases ob  ON ob.project_id = p.id AND ob.phase_id = 1
      LEFT JOIN project_phases ds  ON ds.project_id = p.id AND ds.phase_id = 2
      LEFT JOIN project_phases pc  ON pc.project_id = p.id AND pc.phase_id = 3
      LEFT JOIN project_phases pm  ON pm.project_id = p.id AND pm.phase_id = 4
      LEFT JOIN project_phases hv  ON hv.project_id = p.id AND hv.phase_id = 5

      ORDER BY mpr.level ASC NULLS LAST, p.project_code
    `);

    return NextResponse.json({ success: true, data: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
