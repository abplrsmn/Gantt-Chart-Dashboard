import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { unit_code, unit_name } = body;
  if (!unit_code?.trim() || !unit_name?.trim())
    return NextResponse.json({ success: false, error: "unit_code and unit_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT unit_code, unit_name FROM master_units WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_units SET unit_code=$1, unit_name=$2 WHERE id=$3 RETURNING *`,
      [unit_code.trim().toUpperCase(), unit_name.trim(), id]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.unit_code !== rows[0].unit_code || prev.unit_name !== rows[0].unit_name)) {
      await logChange(client, {
        entityType: "master_unit",
        entityId: id,
        oldValue: `${prev.unit_code} — ${prev.unit_name}`,
        newValue: `${rows[0].unit_code} — ${rows[0].unit_name}`,
        changeSummary: `Unit "${prev.unit_name}" updated to "${rows[0].unit_name}" (${rows[0].unit_code})`,
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
    const check = await client.query(`SELECT unit_code, unit_name FROM master_units WHERE id=$1`, [id]);
    const unit = check.rows[0];

    await client.query(`DELETE FROM master_units WHERE id=$1`, [id]);

    if (unit) {
      await logChange(client, {
        entityType: "master_unit",
        entityId: id,
        oldValue: `${unit.unit_code} — ${unit.unit_name}`,
        changeSummary: `Unit "${unit.unit_name}" (${unit.unit_code}) deleted`,
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
