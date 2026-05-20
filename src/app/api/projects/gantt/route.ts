import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

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
    // This Gantt query joins several small lookup/phase tables. PostgreSQL's JIT
    // can dominate runtime for this kind of dashboard read (seconds vs ms),
    // so keep it off for the pooled session before running the query.
    await client.query("SET jit = off");

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
        mu.unit_code,
        mu.unit_name,
        mc.category_code,
        mc.category_name,

        -- Phase-level dates from project_phases (one row per phase per project)
        ob.normalized_deadline_date   AS brief_deadline,
        ob.received_date              AS brief_received,
        ob.progress_pct               AS brief_progress,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          WHERE pp.project_id = p.id
            AND (pp.phase_id = ob.id OR pp.phase_id = ob.phase_id)
            AND COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS brief_pic,

        ds.start_design_date          AS design_start,
        ds.design_approval_date       AS design_end,
        ds.progress_pct               AS design_progress,
        ds.working_drawing_status,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          WHERE pp.project_id = p.id
            AND (pp.phase_id = ds.id OR pp.phase_id = ds.phase_id)
            AND COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS design_pic,

        pc.tender_start_date          AS control_start,
        pc.aps_spk_released_date      AS control_end,
        pc.progress_pct               AS control_progress,
        pc.phase_contract_amount,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          WHERE pp.project_id = p.id
            AND (pp.phase_id = pc.id OR pp.phase_id = pc.phase_id)
            AND COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS control_pic,

        pm.commence_date              AS pm_start,
        pm.end_contract_date          AS pm_end,
        pm.progress_pct               AS pm_progress,
        pm.deviation_days,
        pm.current_site_progress,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          WHERE pp.project_id = p.id
            AND (pp.phase_id = pm.id OR pp.phase_id = pm.phase_id)
            AND COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS pm_pic,

        hv.bast_1_date                AS handover_start,
        hv.bast_2_date                AS handover_end,
        hv.progress_pct               AS handover_progress,
        hv.actual_phase_completion_date,
        (
          SELECT string_agg(DISTINCT COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')), ', ')
          FROM project_people pp
          WHERE pp.project_id = p.id
            AND (pp.phase_id = hv.id OR pp.phase_id = hv.phase_id)
            AND COALESCE(NULLIF(pp.raw_person_name, ''), NULLIF(pp.raw_organization_name, '')) IS NOT NULL
        ) AS handover_pic

      FROM projects p
      LEFT JOIN master_phases mp_phase       ON mp_phase.id = p.current_phase_id
      LEFT JOIN master_statuses ms           ON ms.id = p.overall_status_id
      LEFT JOIN master_priorities mpr        ON mpr.id = p.priority_id
      LEFT JOIN master_units mu              ON mu.id = p.unit_id
      LEFT JOIN master_project_categories mc ON mc.id = p.category_id

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
    client.release();
  }
}
