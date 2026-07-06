import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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
