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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ success: false, error: "Invalid project id" }, { status: 400 });

  const client = await pool.connect();
  try {
    // ── 1. Try granular period data (project_task_progress_periods) ─────────
    const periodRows = await client.query<{
      period_order: number;
      period_label: string;
      period_start: string;
      period_end: string;
      planned_weight: string;
      actual_weight: string | null;
    }>(`
      SELECT
        pp.period_order,
        pp.period_label,
        pp.period_start::text,
        pp.period_end::text,
        SUM(pp.planned_weight)::numeric AS planned_weight,
        SUM(pp.actual_weight)::numeric  AS actual_weight
      FROM project_task_progress_periods pp
      JOIN project_tasks pt ON pt.id = pp.project_task_id
      WHERE pt.project_id = $1
      GROUP BY pp.period_order, pp.period_label, pp.period_start, pp.period_end
      ORDER BY pp.period_order
    `, [projectId]);

    if (periodRows.rows.length > 0) {
      // Build cumulative S-curve from real period data
      let cumPlanned = 0;
      let cumActual  = 0;
      const points = periodRows.rows.map(r => {
        cumPlanned += Number(r.planned_weight ?? 0);
        const actual = r.actual_weight !== null ? Number(r.actual_weight) : null;
        if (actual !== null) cumActual += actual;
        return {
          month:  r.period_label,
          target: Number(cumPlanned.toFixed(2)),
          actual: actual !== null ? Number(cumActual.toFixed(2)) : null,
        };
      });
      return NextResponse.json({ success: true, source: "periods", data: points });
    }

    // ── 2. Fallback: phase-level progress from project_phases ────────────────
    const phaseRows = await client.query<{
      phase_id: number;
      progress_pct: string;
      commence_date: string | null;
      end_contract_date: string | null;
      received_date: string | null;
      normalized_deadline_date: string | null;
      start_design_date: string | null;
      design_approval_date: string | null;
      tender_start_date: string | null;
      aps_spk_released_date: string | null;
      bast_1_date: string | null;
      bast_2_date: string | null;
    }>(`
      SELECT
        phase_id,
        COALESCE(progress_pct, 0) AS progress_pct,
        commence_date::text,
        end_contract_date::text,
        received_date::text,
        normalized_deadline_date::text,
        start_design_date::text,
        design_approval_date::text,
        tender_start_date::text,
        aps_spk_released_date::text,
        bast_1_date::text,
        bast_2_date::text
      FROM project_phases
      WHERE project_id = $1
      ORDER BY phase_id
    `, [projectId]);

    const projRow = await client.query<{
      start_date: string | null;
      end_date: string | null;
      overall_progress_pct: string | null;
    }>(`SELECT start_date::text, end_date::text, overall_progress_pct FROM projects WHERE id = $1`, [projectId]);

    return NextResponse.json({
      success: true,
      source: "phases",
      phases: phaseRows.rows,
      project: projRow.rows[0] ?? null,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
