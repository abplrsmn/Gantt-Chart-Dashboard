import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      SELECT
        s.id AS step_id, s.letter, s.name AS step_name, s.step_order,
        t.id AS task_id, t.name AS task_name, t.unit, t.vol, t.bobot::float, t.task_order,
        w.week_date, w.plan_pct::float, w.actual_pct::float
      FROM scurve_steps s
      LEFT JOIN scurve_tasks t ON t.step_id = s.id
      LEFT JOIN scurve_task_weeks w ON w.task_id = t.id
      WHERE s.project_id = $1
      ORDER BY s.step_order, s.created_at, t.task_order, t.created_at, w.week_date
    `, [id]);

    // Aggregate into nested structure
    const stepsMap = new Map<string, { id: string; letter: string; name: string; step_order: number; tasks: Map<string, { id: string; name: string; unit: string; vol: string; bobot: number; task_order: number; weeks: { week_date: string; plan_pct: number; actual_pct: number }[] }> }>();

    for (const row of rows) {
      if (!stepsMap.has(row.step_id)) {
        stepsMap.set(row.step_id, {
          id: row.step_id,
          letter: row.letter,
          name: row.step_name,
          step_order: row.step_order,
          tasks: new Map(),
        });
      }
      if (!row.task_id) continue;
      const step = stepsMap.get(row.step_id)!;
      if (!step.tasks.has(row.task_id)) {
        step.tasks.set(row.task_id, {
          id: row.task_id,
          name: row.task_name,
          unit: row.unit ?? "",
          vol: row.vol ?? "",
          bobot: row.bobot ?? 0,
          task_order: row.task_order,
          weeks: [],
        });
      }
      if (row.week_date) {
        step.tasks.get(row.task_id)!.weeks.push({
          week_date: row.week_date instanceof Date
            ? `${row.week_date.getFullYear()}-${String(row.week_date.getMonth()+1).padStart(2,'0')}-${String(row.week_date.getDate()).padStart(2,'0')}`
            : String(row.week_date).slice(0, 10),
          plan_pct: row.plan_pct ?? 0,
          actual_pct: row.actual_pct ?? 0,
        });
      }
    }

    const data = Array.from(stepsMap.values()).map(s => ({
      ...s,
      tasks: Array.from(s.tasks.values()),
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ success: false, error: "Name required" }, { status: 400 });

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    // Count existing steps to assign letter
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM scurve_steps WHERE project_id = $1`, [id]
    );
    const idx = countRows[0].cnt ?? 0;
    const letter = LETTERS[Math.min(idx, 25)];

    const { rows } = await client.query(`
      INSERT INTO scurve_steps (project_id, letter, name, step_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id, letter, name, step_order
    `, [id, letter, name.trim(), idx]);

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
