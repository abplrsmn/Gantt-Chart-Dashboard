import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  if (!projectId) return NextResponse.json({ success: false, error: "Invalid project id" }, { status: 400 });

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("SET jit = off");

    const phaseCheck = await client.query<{ current_phase_code: string | null }>(`
      SELECT mp.phase_code AS current_phase_code
      FROM projects p
      LEFT JOIN master_phases mp ON mp.id = p.current_phase_id
      WHERE p.id = $1
    `, [projectId]);

    if (phaseCheck.rows[0]?.current_phase_code !== "project_management") {
      return NextResponse.json({
        success: true,
        source: "not_project_management",
        summary: { target_progress: 0, actual_progress: 0, variance: 0, total_task_weight: 0 },
        tasks: [],
        data: [],
      });
    }

    // ── 1. Task/period based S-curve ───────────────────────────────────────
    // Formula:
    // - target period = SUM(planned task weight contribution in that period)
    // - actual period = SUM(actual task weight contribution in that period)
    // - cumulative target/actual are running totals across project periods.
    // Each task has weight_pct; period planned/actual values represent weighted
    // contribution points, so totals should end near 100 when the WBS is complete.
    const periodRows = await client.query<{
      period_order: number;
      period_label: string;
      period_start: string;
      period_end: string;
      planned_weight: string;
      actual_weight: string;
    }>(`
      WITH weekly_periods AS (
        SELECT
          date_trunc('week', pp.period_start)::date AS week_start,
          (date_trunc('week', pp.period_start)::date + 6) AS week_end,
          SUM(LEAST(GREATEST(pp.planned_weight, 0), COALESCE(pt.weight_pct, pp.planned_weight)))::numeric AS planned_weight,
          SUM(LEAST(GREATEST(pp.actual_weight, 0), COALESCE(pt.weight_pct, pp.actual_weight)))::numeric  AS actual_weight
        FROM project_task_progress_periods pp
        JOIN project_tasks pt ON pt.id = pp.project_task_id
        WHERE pt.project_id = $1
        GROUP BY date_trunc('week', pp.period_start)::date
      )
      SELECT
        row_number() OVER (ORDER BY week_start)::int AS period_order,
        'W' || row_number() OVER (ORDER BY week_start)::text AS period_label,
        week_start::text AS period_start,
        week_end::text AS period_end,
        planned_weight,
        actual_weight
      FROM weekly_periods
      ORDER BY week_start
    `, [projectId]);

    if (periodRows.rows.length > 0) {
      const taskRows = await client.query<{
        id: string;
        title: string;
        weight_pct: string;
        progress_pct: string;
        phase_name: string | null;
        item_type: string | null;
        item_order: number;
      }>(`
        SELECT
          pt.id::text,
          pt.title,
          COALESCE(pt.weight_pct, 0)::numeric AS weight_pct,
          COALESCE(pt.progress_pct, 0)::numeric AS progress_pct,
          CASE
            WHEN pt.item_type IS NOT NULL AND pt.item_type <> 's_curve' THEN pt.item_type
            ELSE mp.phase_name
          END AS phase_name,
          pt.item_type,
          pt.item_order
        FROM project_tasks pt
        LEFT JOIN project_phases pp ON pp.id = pt.phase_id
        LEFT JOIN master_phases mp ON mp.id = pp.phase_id
        WHERE pt.project_id = $1
        ORDER BY COALESCE(pp.phase_id, 999), pt.item_order, pt.id
      `, [projectId]);

      const taskPeriodRows = await client.query<{
        project_task_id: string;
        period_order: number;
        period_label: string;
        planned_weight: string;
        actual_weight: string;
      }>(`
        WITH task_weeks AS (
          SELECT
            pp.project_task_id::text,
            date_trunc('week', pp.period_start)::date AS week_start,
            SUM(LEAST(GREATEST(pp.planned_weight, 0), COALESCE(pt.weight_pct, pp.planned_weight)))::numeric AS planned_weight,
            SUM(LEAST(GREATEST(pp.actual_weight, 0), COALESCE(pt.weight_pct, pp.actual_weight)))::numeric AS actual_weight
          FROM project_task_progress_periods pp
          JOIN project_tasks pt ON pt.id = pp.project_task_id
          WHERE pt.project_id = $1
          GROUP BY pp.project_task_id, date_trunc('week', pp.period_start)::date
        ), ordered_weeks AS (
          SELECT week_start, row_number() OVER (ORDER BY week_start)::int AS period_order
          FROM (SELECT DISTINCT week_start FROM task_weeks) w
        )
        SELECT
          tw.project_task_id,
          ow.period_order,
          'W' || ow.period_order::text AS period_label,
          tw.planned_weight,
          tw.actual_weight
        FROM task_weeks tw
        JOIN ordered_weeks ow ON ow.week_start = tw.week_start
        JOIN project_tasks pt ON pt.id::text = tw.project_task_id
        ORDER BY pt.item_order, ow.period_order
      `, [projectId]);

      const periodsByTask = new Map<string, { period_order: number; label: string; planned: number; actual: number; actual_pct: number }[]>();
      for (const r of taskPeriodRows.rows) {
        const task = taskRows.rows.find(t => t.id === r.project_task_id);
        const weight = Number(task?.weight_pct ?? 0);
        const actual = Number(r.actual_weight ?? 0);
        const planned = Number(r.planned_weight ?? 0);
        const arr = periodsByTask.get(r.project_task_id) ?? [];
        arr.push({
          period_order: r.period_order,
          label: r.period_label,
          planned: Number(planned.toFixed(2)),
          actual: Number(actual.toFixed(2)),
          actual_pct: weight > 0 ? Number(((actual / weight) * 100).toFixed(0)) : 0,
        });
        periodsByTask.set(r.project_task_id, arr);
      }

      let cumPlanned = 0;
      let cumActual  = 0;
      const points = [
        {
          month: "Start",
          period_start: periodRows.rows[0]?.period_start ?? null,
          period_end: periodRows.rows[0]?.period_start ?? null,
          planned_weekly: 0,
          actual_weekly: 0,
          target: 0,
          actual: 0,
          variance: 0,
          is_baseline: true,
        },
        ...periodRows.rows.map(r => {
          const planned = Number(r.planned_weight ?? 0);
          const actual = Number(r.actual_weight ?? 0);
          cumPlanned += planned;
          cumActual += actual;
          return {
            month:  r.period_label,
            period_start: r.period_start,
            period_end: r.period_end,
            planned_weekly: Number(planned.toFixed(2)),
            actual_weekly: Number(actual.toFixed(2)),
            target: Number(Math.min(100, cumPlanned).toFixed(2)),
            actual: Number(Math.min(100, cumActual).toFixed(2)),
            variance: Number((cumActual - cumPlanned).toFixed(2)),
            is_baseline: false,
          };
        }),
      ];

      const latest = [...points].reverse().find(p => p.actual !== null) ?? points[points.length - 1];
      return NextResponse.json({
        success: true,
        source: "tasks",
        formula: "target=sum(planned_weight); actual=sum(actual_weight); cumulative=running total by period; task weights define 100% WBS baseline",
        summary: {
          target_progress: latest?.target ?? 0,
          actual_progress: latest?.actual ?? 0,
          variance: latest ? Number(((latest.actual ?? 0) - latest.target).toFixed(2)) : 0,
          total_task_weight: Number(taskRows.rows.reduce((s, r) => s + Number(r.weight_pct ?? 0), 0).toFixed(2)),
        },
        tasks: taskRows.rows.map(t => ({
          id: t.id,
          title: t.title,
          weight: Number(t.weight_pct ?? 0),
          progress: Number(t.progress_pct ?? 0),
          phase: t.phase_name ?? t.item_type ?? "Work Items",
          item_order: t.item_order,
          periods: periodsByTask.get(t.id) ?? [],
        })),
        data: points,
      });
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
    client?.release();
  }
}
