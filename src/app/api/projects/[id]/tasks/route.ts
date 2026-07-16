import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

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
        pt.item_type,
        pt.phase_id::text AS phase_id,
        pt.raw_assignee_name,
        pt.raw_assigned_by_name
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
  const body = await req.json() as { title?: string; weight_pct?: number; progress_pct?: number; item_order?: number; phase_id?: string | null; raw_assignee_name?: string | null; raw_assigned_by_name?: string | null };
  const { title, weight_pct = 0, progress_pct = 0, item_order, phase_id, raw_assignee_name, raw_assigned_by_name } = body;
  if (!title?.trim()) return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });

  const user = await getAuthUserFromCookie();
  const changedByName = user?.fullName ?? user?.email ?? "Unknown";

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
      INSERT INTO project_tasks (project_id, title, weight_pct, progress_pct, item_order, item_type, phase_id, raw_assignee_name, raw_assigned_by_name)
      VALUES ($1, $2, $3, $4, $5, 's_curve', $6, $7, $8)
      RETURNING id::text, title, weight_pct::numeric, progress_pct::numeric, item_order, phase_id::text AS phase_id, raw_assignee_name, raw_assigned_by_name
    `, [id, title.trim(), weight_pct, progress_pct, order, phase_id ?? null, raw_assignee_name?.trim() || null, raw_assigned_by_name?.trim() || null]);

    const task = rows[0];
    const parts = [`Sub-task "${task.title}" ditambahkan`];
    if (task.raw_assignee_name)   parts.push(`assignee: ${task.raw_assignee_name}`);
    if (task.raw_assigned_by_name) parts.push(`assigned by: ${task.raw_assigned_by_name}`);

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_tasks', 'title', NULL, $2, $3, $4, 'task_added', NOW())`,
      [id, task.title, parts.join(", "), changedByName]
    );

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// PATCH — update title, weight_pct, or progress_pct for a task (taskId in body)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json() as { taskId?: string; title?: string; weight_pct?: number; progress_pct?: number; item_order?: number; raw_assignee_name?: string | null; raw_assigned_by_name?: string | null };
  const { taskId, title, weight_pct, progress_pct, item_order, raw_assignee_name, raw_assigned_by_name } = body;
  if (!taskId) return NextResponse.json({ success: false, error: "taskId required" }, { status: 400 });

  const user = await getAuthUserFromCookie();
  const changedByName = user?.fullName ?? user?.email ?? "Unknown";

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Fetch current task state for audit diff
    const before = await client.query(
      `SELECT title, progress_pct, weight_pct, item_order, raw_assignee_name, raw_assigned_by_name
       FROM project_tasks WHERE id::text = $1 AND project_id = $2`,
      [taskId, id]
    );
    const prev = before.rows[0];

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (title            != null) { sets.push(`title = $${vals.length + 1}`);              vals.push(title.trim()); }
    if (weight_pct       != null) { sets.push(`weight_pct = $${vals.length + 1}`);         vals.push(weight_pct); }
    if (progress_pct     != null) { sets.push(`progress_pct = $${vals.length + 1}`);       vals.push(progress_pct); }
    if (item_order       != null) { sets.push(`item_order = $${vals.length + 1}`);         vals.push(item_order); }
    if ("raw_assignee_name"    in body) { sets.push(`raw_assignee_name = $${vals.length + 1}`);     vals.push(raw_assignee_name?.trim()    || null); }
    if ("raw_assigned_by_name" in body) { sets.push(`raw_assigned_by_name = $${vals.length + 1}`);  vals.push(raw_assigned_by_name?.trim() || null); }
    if (sets.length === 0) return NextResponse.json({ success: false, error: "nothing to update" }, { status: 400 });

    vals.push(taskId, id);
    await client.query(
      `UPDATE project_tasks SET ${sets.join(", ")} WHERE id::text = $${vals.length - 1} AND project_id = $${vals.length}`,
      vals
    );

    // Audit: rename, reweight, reorder, reassign
    if (prev) {
      const changes: string[] = [];
      if (title != null && prev.title !== title.trim()) {
        changes.push(`title: "${prev.title}" → "${title.trim()}"`);
      }
      if (weight_pct != null && Number(prev.weight_pct) !== Number(weight_pct)) {
        changes.push(`weight: ${prev.weight_pct}% → ${weight_pct}%`);
      }
      if (item_order != null && Number(prev.item_order) !== Number(item_order)) {
        changes.push(`order: ${prev.item_order} → ${item_order}`);
      }
      if ("raw_assignee_name" in body) {
        const nextAssignee = raw_assignee_name?.trim() || null;
        if ((prev.raw_assignee_name ?? null) !== nextAssignee) {
          changes.push(`assignee: ${prev.raw_assignee_name ?? "—"} → ${nextAssignee ?? "—"}`);
        }
      }
      if ("raw_assigned_by_name" in body) {
        const nextAssignedBy = raw_assigned_by_name?.trim() || null;
        if ((prev.raw_assigned_by_name ?? null) !== nextAssignedBy) {
          changes.push(`assigned by: ${prev.raw_assigned_by_name ?? "—"} → ${nextAssignedBy ?? "—"}`);
        }
      }
      if (changes.length > 0) {
        await client.query(
          `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
           VALUES ($1, 'project_tasks', NULL, NULL, NULL, $2, $3, 'task_updated', NOW())`,
          [id, `Sub-task "${prev.title}" updated — ${changes.join(", ")}`, changedByName]
        );
      }
    }

    // Audit: task completed/uncompleted
    if (progress_pct != null && prev) {
      const wasCompleted = Number(prev.progress_pct) >= 100;
      const nowCompleted = Number(progress_pct) >= 100;
      if (!wasCompleted && nowCompleted) {
        await client.query(
          `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
           VALUES ($1, 'project_tasks', 'progress_pct', $2, $3, $4, $5, 'task_completed', NOW())`,
          [id, String(prev.progress_pct), String(progress_pct), `Sub-task "${prev?.title}" ditandai selesai`, changedByName]
        );
      } else if (wasCompleted && !nowCompleted) {
        await client.query(
          `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
           VALUES ($1, 'project_tasks', 'progress_pct', $2, $3, $4, $5, 'task_reopened', NOW())`,
          [id, String(prev.progress_pct), String(progress_pct), `Sub-task "${prev?.title}" dibuka kembali`, changedByName]
        );
      }
    }

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

  const user = await getAuthUserFromCookie();
  const changedByName = user?.fullName ?? user?.email ?? "Unknown";

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    const check = await client.query(
      `SELECT title FROM project_tasks WHERE id::text = $1 AND project_id = $2`,
      [body.taskId, id]
    );
    const taskTitle = check.rows[0]?.title ?? "Unknown";

    await client.query(`DELETE FROM project_task_progress_periods WHERE project_task_id = $1`, [body.taskId]);
    await client.query(`DELETE FROM project_tasks WHERE id::text = $1 AND project_id = $2`, [body.taskId, id]);

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_tasks', 'title', $2, NULL, $3, $4, 'task_deleted', NOW())`,
      [id, taskTitle, `Sub-task "${taskTitle}" dihapus`, changedByName]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
