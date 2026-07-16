import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const check = await client.query(`SELECT letter, name FROM scurve_steps WHERE id = $1 AND project_id = $2`, [stepId, id]);
    const step = check.rows[0];

    await client.query(`DELETE FROM scurve_steps WHERE id = $1 AND project_id = $2`, [stepId, id]);

    if (step) {
      await logChange(client, {
        projectId: id,
        entityType: "scurve_step",
        oldValue: step.name,
        changeSummary: `S-curve step "${step.letter}. ${step.name}" deleted`,
        changedByName: await getChangedByName(),
        actionType: "scurve_step_deleted",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await params;
  const { name } = await req.json() as { name: string };
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const before = await client.query(`SELECT letter, name FROM scurve_steps WHERE id = $1 AND project_id = $2`, [stepId, id]);
    const prev = before.rows[0];

    await client.query(
      `UPDATE scurve_steps SET name = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3`,
      [name.trim(), stepId, id]
    );

    if (prev && prev.name !== name.trim()) {
      await logChange(client, {
        projectId: id,
        entityType: "scurve_step",
        oldValue: prev.name,
        newValue: name.trim(),
        changeSummary: `S-curve step "${prev.letter}. ${prev.name}" renamed to "${name.trim()}"`,
        changedByName: await getChangedByName(),
        actionType: "scurve_step_updated",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
