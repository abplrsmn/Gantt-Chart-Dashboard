import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { category_code, category_name } = body;
  if (!category_code?.trim() || !category_name?.trim())
    return NextResponse.json({ success: false, error: "category_code and category_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE master_project_categories SET category_code=$1, category_name=$2 WHERE id=$3 RETURNING *`,
      [category_code.trim().toUpperCase(), category_name.trim(), id]
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
    await client.query(`DELETE FROM master_project_categories WHERE id=$1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
