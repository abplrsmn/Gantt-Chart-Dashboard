import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { priority_code, priority_name, color_hex, level } = body;
  if (!priority_code?.trim() || !priority_name?.trim())
    return NextResponse.json({ success: false, error: "priority_code and priority_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT priority_code, priority_name FROM master_priorities WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_priorities SET priority_code=$1, priority_name=$2, color_hex=$3, level=$4 WHERE id=$5 RETURNING *`,
      [priority_code.trim().toUpperCase(), priority_name.trim(), color_hex || "#94a3b8", level ?? 99, id]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.priority_code !== rows[0].priority_code || prev.priority_name !== rows[0].priority_name)) {
      await logChange(client, {
        entityType: "master_priority",
        entityId: id,
        oldValue: `${prev.priority_code} — ${prev.priority_name}`,
        newValue: `${rows[0].priority_code} — ${rows[0].priority_name}`,
        changeSummary: `Priority "${prev.priority_name}" updated to "${rows[0].priority_name}" (${rows[0].priority_code})`,
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
    const check = await client.query(`SELECT priority_code, priority_name FROM master_priorities WHERE id=$1`, [id]);
    const priority = check.rows[0];

    await client.query(`DELETE FROM master_priorities WHERE id=$1`, [id]);

    if (priority) {
      await logChange(client, {
        entityType: "master_priority",
        entityId: id,
        oldValue: `${priority.priority_code} — ${priority.priority_name}`,
        changeSummary: `Priority "${priority.priority_name}" (${priority.priority_code}) deleted`,
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
