import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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
    const { rows } = await client.query(
      `UPDATE master_priorities SET priority_code=$1, priority_name=$2, color_hex=$3, level=$4 WHERE id=$5 RETURNING *`,
      [priority_code.trim().toUpperCase(), priority_name.trim(), color_hex || "#94a3b8", level ?? 99, id]
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
    await client.query(`DELETE FROM master_priorities WHERE id=$1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
