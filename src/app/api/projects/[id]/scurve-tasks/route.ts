import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { stepId: string; name: string; unit?: string; vol?: string; bobot?: number };
  if (!body.stepId || !body.name?.trim()) {
    return NextResponse.json({ success: false, error: "stepId and name required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Verify step belongs to this project
    const check = await client.query(
      `SELECT id FROM scurve_steps WHERE id = $1 AND project_id = $2`, [body.stepId, id]
    );
    if (!check.rows.length) return NextResponse.json({ success: false, error: "Step not found" }, { status: 404 });

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM scurve_tasks WHERE step_id = $1`, [body.stepId]
    );
    const order = countRows[0].cnt ?? 0;

    const { rows } = await client.query(`
      INSERT INTO scurve_tasks (step_id, project_id, name, unit, vol, bobot, task_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, unit, vol, bobot::float, task_order
    `, [body.stepId, id, body.name.trim(), body.unit ?? "", body.vol ?? "", body.bobot ?? 0, order]);

    await logChange(client, {
      projectId: id,
      entityType: "scurve_task",
      newValue: rows[0].name,
      changeSummary: `S-curve task "${rows[0].name}" added (weight ${rows[0].bobot}%)`,
      changedByName: await getChangedByName(),
      actionType: "scurve_task_added",
    });

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
