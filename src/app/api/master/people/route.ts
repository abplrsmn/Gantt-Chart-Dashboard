import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, employee_code, full_name, nickname, department, job_title, email, is_active FROM master_people ORDER BY full_name`
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
  const { full_name, email, nickname, department, job_title, employee_code } = body;
  if (!full_name?.trim())
    return NextResponse.json({ success: false, error: "full_name is required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO master_people (employee_code, full_name, nickname, department, job_title, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [
        employee_code?.trim() || null,
        full_name.trim(),
        nickname?.trim() || null,
        department?.trim() || null,
        job_title?.trim() || null,
        email?.trim()?.toLowerCase() || null,
      ]
    );
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
