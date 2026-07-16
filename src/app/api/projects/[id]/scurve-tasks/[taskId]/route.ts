import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const check = await client.query(`SELECT name FROM scurve_tasks WHERE id = $1 AND project_id = $2`, [taskId, id]);
    const task = check.rows[0];

    await client.query(`DELETE FROM scurve_tasks WHERE id = $1 AND project_id = $2`, [taskId, id]);

    if (task) {
      await logChange(client, {
        projectId: id,
        entityType: "scurve_task",
        oldValue: task.name,
        changeSummary: `S-curve task "${task.name}" deleted`,
        changedByName: await getChangedByName(),
        actionType: "scurve_task_deleted",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const body = await req.json() as { name?: string; unit?: string; vol?: string; bobot?: number };
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const before = await client.query(`SELECT name, unit, vol, bobot::float FROM scurve_tasks WHERE id = $1 AND project_id = $2`, [taskId, id]);
    const prev = before.rows[0];

    await client.query(`
      UPDATE scurve_tasks
      SET name = COALESCE($1, name),
          unit = COALESCE($2, unit),
          vol  = COALESCE($3, vol),
          bobot = COALESCE($4, bobot),
          updated_at = NOW()
      WHERE id = $5 AND project_id = $6
    `, [body.name ?? null, body.unit ?? null, body.vol ?? null, body.bobot ?? null, taskId, id]);

    if (prev) {
      const changes: string[] = [];
      if (body.name  != null && prev.name  !== body.name.trim()) changes.push(`name: "${prev.name}" → "${body.name.trim()}"`);
      if (body.bobot != null && Number(prev.bobot) !== Number(body.bobot)) changes.push(`weight: ${prev.bobot}% → ${body.bobot}%`);
      if (body.unit  != null && prev.unit  !== body.unit) changes.push(`unit: ${prev.unit || "—"} → ${body.unit || "—"}`);
      if (body.vol   != null && prev.vol   !== body.vol)  changes.push(`vol: ${prev.vol || "—"} → ${body.vol || "—"}`);
      if (changes.length > 0) {
        await logChange(client, {
          projectId: id,
          entityType: "scurve_task",
          changeSummary: `S-curve task "${prev.name}" updated — ${changes.join(", ")}`,
          changedByName: await getChangedByName(),
          actionType: "scurve_task_updated",
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
