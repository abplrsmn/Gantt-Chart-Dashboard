import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isPhaseDetailType } from "@/lib/phase-details";

const KEY_RE = /^[a-z][a-z0-9_]{0,79}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  const { rows } = await pool.query(
    `SELECT id::text AS id, phase_id::text AS phase_id, field_key, field_label, field_type,
            field_order, is_required
       FROM master_phase_detail_fields
      WHERE phase_id = $1
      ORDER BY field_order, id`,
    [id]
  );
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const key = typeof body.field_key === "string" ? body.field_key.trim().toLowerCase() : "";
  const label = typeof body.field_label === "string" ? body.field_label.trim() : "";
  if (!KEY_RE.test(key) || !label || !isPhaseDetailType(body.field_type)) {
    return NextResponse.json({ success: false, error: "Field key, label, and valid field type are required." }, { status: 400 });
  }
  const pool = getDbPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO master_phase_detail_fields
         (phase_id, field_key, field_label, field_type, field_order, is_required)
       VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(field_order) + 1 FROM master_phase_detail_fields WHERE phase_id = $1), 1), $5)
       RETURNING id::text AS id, phase_id::text AS phase_id, field_key, field_label, field_type, field_order, is_required`,
      [id, key, label, body.field_type, Boolean(body.is_required)]
    );
    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not create field" }, { status: 500 });
  }
}
