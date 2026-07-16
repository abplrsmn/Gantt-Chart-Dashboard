import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { entity_type, status_code, status_label, color } = body;
  if (!status_code?.trim() || !status_label?.trim())
    return NextResponse.json({ success: false, error: "status_code and status_label are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT status_code, status_label FROM master_statuses WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_statuses SET entity_type=$1, status_code=$2, status_label=$3, color=$4 WHERE id=$5 RETURNING *`,
      [entity_type?.trim() || "project", status_code.trim().toLowerCase(), status_label.trim(), color || "#94a3b8", id]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.status_code !== rows[0].status_code || prev.status_label !== rows[0].status_label)) {
      await logChange(client, {
        entityType: "master_status",
        entityId: id,
        oldValue: `${prev.status_code} — ${prev.status_label}`,
        newValue: `${rows[0].status_code} — ${rows[0].status_label}`,
        changeSummary: `Status "${prev.status_label}" updated to "${rows[0].status_label}" (${rows[0].status_code})`,
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
    const check = await client.query(`SELECT status_code, status_label FROM master_statuses WHERE id=$1`, [id]);
    const status = check.rows[0];

    await client.query(`DELETE FROM master_statuses WHERE id=$1`, [id]);

    if (status) {
      await logChange(client, {
        entityType: "master_status",
        entityId: id,
        oldValue: `${status.status_code} — ${status.status_label}`,
        changeSummary: `Status "${status.status_label}" (${status.status_code}) deleted`,
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
