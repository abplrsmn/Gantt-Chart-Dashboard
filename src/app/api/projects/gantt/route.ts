import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false,
});

export async function GET() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.overall_progress_pct,
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

        -- Phase-level dates from project_phases (one row per phase per project)
        ob.normalized_deadline_date   AS brief_deadline,
        ob.received_date              AS brief_received,
        ob.progress_pct               AS brief_progress,

        ds.start_design_date          AS design_start,
        ds.design_approval_date       AS design_end,
        ds.progress_pct               AS design_progress,
        ds.working_drawing_status,

        pc.tender_start_date          AS control_start,
        pc.aps_spk_released_date      AS control_end,
        pc.progress_pct               AS control_progress,
        pc.phase_contract_amount,

        pm.commence_date              AS pm_start,
        pm.end_contract_date          AS pm_end,
        pm.progress_pct               AS pm_progress,
        pm.deviation_days,
        pm.current_site_progress,

        hv.bast_1_date                AS handover_start,
        hv.bast_2_date                AS handover_end,
        hv.progress_pct               AS handover_progress,
        hv.actual_phase_completion_date

      FROM projects p
      LEFT JOIN master_phases mp_phase       ON mp_phase.id = p.current_phase_id
      LEFT JOIN master_statuses ms           ON ms.id = p.overall_status_id
      LEFT JOIN master_priorities mpr        ON mpr.id = p.priority_id

      -- Join each phase row
      LEFT JOIN project_phases ob  ON ob.project_id = p.id AND ob.phase_id = (SELECT id FROM master_phases WHERE phase_code = 'operational_brief' LIMIT 1)
      LEFT JOIN project_phases ds  ON ds.project_id = p.id AND ds.phase_id = (SELECT id FROM master_phases WHERE phase_code = 'design' LIMIT 1)
      LEFT JOIN project_phases pc  ON pc.project_id = p.id AND pc.phase_id = (SELECT id FROM master_phases WHERE phase_code = 'project_control' LIMIT 1)
      LEFT JOIN project_phases pm  ON pm.project_id = p.id AND pm.phase_id = (SELECT id FROM master_phases WHERE phase_code = 'project_management' LIMIT 1)
      LEFT JOIN project_phases hv  ON hv.project_id = p.id AND hv.phase_id = (SELECT id FROM master_phases WHERE phase_code = 'handover' LIMIT 1)

      ORDER BY mpr.level ASC NULLS LAST, p.project_code
    `);

    return NextResponse.json({ success: true, data: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
