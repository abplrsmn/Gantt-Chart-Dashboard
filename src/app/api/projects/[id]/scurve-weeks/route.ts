import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH — upsert a single week value for a task
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { taskId: string; weekDate: string; planPct?: number; actualPct?: number; mode: "plan" | "actual" };

  if (!body.taskId || !body.weekDate) {
    return NextResponse.json({ success: false, error: "taskId and weekDate required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Verify task belongs to this project
    const check = await client.query(
      `SELECT id FROM scurve_tasks WHERE id = $1 AND project_id = $2`, [body.taskId, id]
    );
    if (!check.rows.length) return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });

    if (body.mode === "plan") {
      await client.query(`
        INSERT INTO scurve_task_weeks (task_id, week_date, plan_pct, actual_pct)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (task_id, week_date) DO UPDATE SET plan_pct = EXCLUDED.plan_pct
      `, [body.taskId, body.weekDate, body.planPct ?? 0]);
    } else {
      await client.query(`
        INSERT INTO scurve_task_weeks (task_id, week_date, plan_pct, actual_pct)
        VALUES ($1, $2, 0, $3)
        ON CONFLICT (task_id, week_date) DO UPDATE SET actual_pct = EXCLUDED.actual_pct
      `, [body.taskId, body.weekDate, body.actualPct ?? 0]);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
