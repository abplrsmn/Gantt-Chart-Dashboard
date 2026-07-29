import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isPhaseDetailType } from "@/lib/phase-details";

const KEY_RE = /^[a-z][a-z0-9_]{0,79}$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; detailId: string }> }) {
  const { id, detailId } = await params;
  const body = await req.json();
  const key = typeof body.field_key === "string" ? body.field_key.trim().toLowerCase() : "";
  const label = typeof body.field_label === "string" ? body.field_label.trim() : "";
  if (!KEY_RE.test(key) || !label || !isPhaseDetailType(body.field_type)) {
    return NextResponse.json({ success: false, error: "Field key, label, and valid field type are required." }, { status: 400 });
  }
  const pool = getDbPool();
  try {
    const { rows } = await pool.query(
      `UPDATE master_phase_detail_fields
          SET field_key = $1, field_label = $2, field_type = $3, is_required = $4, updated_at = NOW()
        WHERE id = $5 AND phase_id = $6
        RETURNING id::text AS id, phase_id::text AS phase_id, field_key, field_label, field_type, field_order, is_required`,
      [key, label, body.field_type, Boolean(body.is_required), detailId, id]
    );
    if (!rows[0]) return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update field" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; detailId: string }> }) {
  const { id, detailId } = await params;
  const pool = getDbPool();
  const result = await pool.query(`DELETE FROM master_phase_detail_fields WHERE id = $1 AND phase_id = $2`, [detailId, id]);
  if (!result.rowCount) return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
