import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, category_code, category_name FROM master_project_categories ORDER BY category_name`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { category_code, category_name } = body;
  if (!category_code?.trim() || !category_name?.trim())
    return NextResponse.json({ success: false, error: "category_code and category_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO master_project_categories (category_code, category_name) VALUES ($1, $2) RETURNING *`,
      [category_code.trim().toUpperCase(), category_name.trim()]
    );
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
