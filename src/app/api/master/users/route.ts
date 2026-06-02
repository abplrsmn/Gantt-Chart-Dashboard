import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT a.id, a.email, a.is_admin, a.is_active, a.created_at,
             p.id AS person_id, p.full_name, p.department, p.job_title, p.employee_code
      FROM master_acc a
      LEFT JOIN master_people p ON p.id = a.person_id
      ORDER BY a.id
    `);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { full_name, email, password, is_admin, department, job_title, employee_code } = body;
  if (!full_name?.trim() || !email?.trim() || !password?.trim())
    return NextResponse.json({ success: false, error: "full_name, email, and password are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: peopleRows } = await client.query(
      `INSERT INTO master_people (employee_code, full_name, email, department, job_title, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [employee_code?.trim() || null, full_name.trim(), email.trim().toLowerCase(), department?.trim() || null, job_title?.trim() || null]
    );
    const personId = peopleRows[0].id;

    const hash = await bcrypt.hash(password, 12);
    const { rows: accRows } = await client.query(
      `INSERT INTO master_acc (person_id, email, password_hash, is_admin, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id, email, is_admin, is_active, created_at`,
      [personId, email.trim().toLowerCase(), hash, Boolean(is_admin)]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, data: { ...accRows[0], full_name: full_name.trim(), person_id: personId } });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
