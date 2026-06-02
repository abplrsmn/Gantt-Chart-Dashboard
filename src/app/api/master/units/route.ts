import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, unit_code, unit_name FROM master_units ORDER BY unit_name`
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
  const { unit_code, unit_name } = body;
  if (!unit_code?.trim() || !unit_name?.trim())
    return NextResponse.json({ success: false, error: "unit_code and unit_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO master_units (unit_code, unit_name) VALUES ($1, $2) RETURNING *`,
      [unit_code.trim().toUpperCase(), unit_name.trim()]
    );
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
