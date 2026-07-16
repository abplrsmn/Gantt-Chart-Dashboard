import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { phase_code, phase_name } = body;
  if (!phase_code?.trim() || !phase_name?.trim())
    return NextResponse.json({ success: false, error: "phase_code and phase_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT phase_code, phase_name FROM master_phases WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_phases SET phase_code=$1, phase_name=$2 WHERE id=$3 RETURNING *`,
      [phase_code.trim().toLowerCase(), phase_name.trim(), id]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.phase_code !== rows[0].phase_code || prev.phase_name !== rows[0].phase_name)) {
      await logChange(client, {
        entityType: "master_phase",
        entityId: id,
        oldValue: `${prev.phase_code} — ${prev.phase_name}`,
        newValue: `${rows[0].phase_code} — ${rows[0].phase_name}`,
        changeSummary: `Phase "${prev.phase_name}" updated to "${rows[0].phase_name}" (${rows[0].phase_code})`,
        changedByName: await getChangedByName(),
        actionType: "master_updated",
      });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const check = await client.query(`SELECT phase_code, phase_name FROM master_phases WHERE id=$1`, [id]);
    const phase = check.rows[0];

    await client.query(`DELETE FROM master_phases WHERE id=$1`, [id]);

    if (phase) {
      await logChange(client, {
        entityType: "master_phase",
        entityId: id,
        oldValue: `${phase.phase_code} — ${phase.phase_name}`,
        changeSummary: `Phase "${phase.phase_name}" (${phase.phase_code}) deleted`,
        changedByName: await getChangedByName(),
        actionType: "master_deleted",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
