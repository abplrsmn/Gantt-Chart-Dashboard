import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

type ImportPeriod = {
  period_order: number;
  period_start: string; // YYYY-MM-DD
  planned_weight: number;
  actual_weight: number;
};

type ImportTask = {
  title: string;
  weight_pct: number;
  periods: ImportPeriod[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { tasks: ImportTask[] };

  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    return NextResponse.json({ success: false, error: "tasks array required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Delete existing s_curve tasks (and their periods via cascade or manual delete)
    const existingTasks = await client.query(
      `SELECT id FROM project_tasks WHERE project_id = $1 AND item_type = 's_curve'`,
      [id]
    );
    const taskIds = existingTasks.rows.map(r => r.id);
    if (taskIds.length > 0) {
      await client.query(
        `DELETE FROM project_task_progress_periods WHERE project_task_id = ANY($1::bigint[])`,
        [taskIds]
      );
      await client.query(
        `DELETE FROM project_tasks WHERE id = ANY($1::bigint[]) AND project_id = $2`,
        [taskIds, id]
      );
    }

    // Insert new tasks + periods
    for (let i = 0; i < body.tasks.length; i++) {
      const t = body.tasks[i];
      const { rows: inserted } = await client.query(
        `INSERT INTO project_tasks (project_id, title, weight_pct, progress_pct, item_order, item_type)
         VALUES ($1, $2, $3, 0, $4, 's_curve')
         RETURNING id`,
        [id, t.title.trim(), t.weight_pct, i]
      );
      const taskId = inserted[0].id;

      for (const p of t.periods) {
        if (p.planned_weight === 0 && p.actual_weight === 0) continue;
        await client.query(
          `INSERT INTO project_task_progress_periods
             (project_task_id, period_order, period_start, planned_weight, actual_weight)
           VALUES ($1, $2, $3, $4, $5)`,
          [taskId, p.period_order, p.period_start, p.planned_weight, p.actual_weight]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, imported: body.tasks.length });
  } catch (err: unknown) {
    await client?.query("ROLLBACK").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
