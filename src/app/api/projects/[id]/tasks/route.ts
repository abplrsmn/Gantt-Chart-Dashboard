import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET — list all tasks for a project
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query(`
      SELECT
        pt.id::text,
        pt.title,
        COALESCE(pt.weight_pct, 0)::numeric AS weight_pct,
        COALESCE(pt.progress_pct, 0)::numeric AS progress_pct,
        pt.item_order,
        pt.item_type
      FROM project_tasks pt
      WHERE pt.project_id = $1
      ORDER BY pt.item_order, pt.id
    `, [id]);
    return NextResponse.json({ success: true, data: rows });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// POST — create a single task
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json() as { title?: string; weight_pct?: number; progress_pct?: number; item_order?: number };
  const { title, weight_pct = 0, progress_pct = 0, item_order } = body;
  if (!title?.trim()) return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Auto-order: place after last existing task
    let order = item_order;
    if (order == null) {
      const last = await client.query(`SELECT COALESCE(MAX(item_order), 0) AS mx FROM project_tasks WHERE project_id = $1`, [id]);
      order = Number(last.rows[0].mx) + 1;
    }

    const { rows } = await client.query(`
      INSERT INTO project_tasks (project_id, title, weight_pct, progress_pct, item_order, item_type)
      VALUES ($1, $2, $3, $4, $5, 's_curve')
      RETURNING id::text, title, weight_pct::numeric, progress_pct::numeric, item_order
    `, [id, title.trim(), weight_pct, progress_pct, order]);

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// PATCH — update title, weight_pct, or progress_pct for a task (taskId in body)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json() as { taskId?: string; title?: string; weight_pct?: number; progress_pct?: number; item_order?: number };
  const { taskId, title, weight_pct, progress_pct, item_order } = body;
  if (!taskId) return NextResponse.json({ success: false, error: "taskId required" }, { status: 400 });

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (title       != null) { sets.push(`title = $${vals.length + 1}`);        vals.push(title.trim()); }
    if (weight_pct  != null) { sets.push(`weight_pct = $${vals.length + 1}`);   vals.push(weight_pct); }
    if (progress_pct != null){ sets.push(`progress_pct = $${vals.length + 1}`); vals.push(progress_pct); }
    if (item_order  != null) { sets.push(`item_order = $${vals.length + 1}`);   vals.push(item_order); }
    if (sets.length === 0) return NextResponse.json({ success: false, error: "nothing to update" }, { status: 400 });

    vals.push(taskId, id);
    await client.query(
      `UPDATE project_tasks SET ${sets.join(", ")} WHERE id::text = $${vals.length - 1} AND project_id = $${vals.length}`,
      vals
    );
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// DELETE — remove a task (taskId in body)
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json() as { taskId?: string };
  if (!body.taskId) return NextResponse.json({ success: false, error: "taskId required" }, { status: 400 });

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    // Also clean up periods linked to this task
    await client.query(`DELETE FROM project_task_progress_periods WHERE project_task_id = $1`, [body.taskId]);
    await client.query(`DELETE FROM project_tasks WHERE id::text = $1 AND project_id = $2`, [body.taskId, id]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
