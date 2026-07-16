import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { full_name, email, nickname, department, job_title, phone_number, is_active } = body;
  if (!full_name?.trim())
    return NextResponse.json({ success: false, error: "full_name is required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT full_name, is_active FROM master_people WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_people SET full_name=$1, nickname=$2, department=$3, job_title=$4, email=$5, phone_number=$6, is_active=$7
       WHERE id=$8 RETURNING *`,
      [
        full_name.trim(),
        nickname?.trim() || null,
        department?.trim() || null,
        job_title?.trim() || null,
        email?.trim()?.toLowerCase() || null,
        phone_number?.trim() || null,
        is_active !== false,
        id,
      ]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.full_name !== rows[0].full_name || Boolean(prev.is_active) !== Boolean(rows[0].is_active))) {
      await logChange(client, {
        entityType: "master_person",
        entityId: id,
        oldValue: prev.full_name,
        newValue: rows[0].full_name,
        changeSummary: `Stakeholder "${prev.full_name}" updated${prev.full_name !== rows[0].full_name ? ` to "${rows[0].full_name}"` : ""}${Boolean(prev.is_active) !== Boolean(rows[0].is_active) ? ` (${rows[0].is_active ? "activated" : "deactivated"})` : ""}`,
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
    const check = await client.query(`SELECT full_name FROM master_people WHERE id=$1`, [id]);
    const person = check.rows[0];

    await client.query(`DELETE FROM master_people WHERE id=$1`, [id]);

    if (person) {
      await logChange(client, {
        entityType: "master_person",
        entityId: id,
        oldValue: person.full_name,
        changeSummary: `Stakeholder "${person.full_name}" deleted`,
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
