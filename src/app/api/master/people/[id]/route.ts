import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { full_name, email, nickname, department, job_title, employee_code, is_active } = body;
  if (!full_name?.trim())
    return NextResponse.json({ success: false, error: "full_name is required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE master_people SET employee_code=$1, full_name=$2, nickname=$3, department=$4, job_title=$5, email=$6, is_active=$7
       WHERE id=$8 RETURNING *`,
      [
        employee_code?.trim() || null,
        full_name.trim(),
        nickname?.trim() || null,
        department?.trim() || null,
        job_title?.trim() || null,
        email?.trim()?.toLowerCase() || null,
        is_active !== false,
        id,
      ]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
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
    await client.query(`DELETE FROM master_people WHERE id=$1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
