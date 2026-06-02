import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { full_name, is_admin, is_active, password, department, job_title, employee_code } = body;

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update master_acc
    if (password?.trim()) {
      const hash = await bcrypt.hash(password.trim(), 12);
      await client.query(
        `UPDATE master_acc SET is_admin=$1, is_active=$2, password_hash=$3, updated_at=now() WHERE id=$4`,
        [Boolean(is_admin), Boolean(is_active), hash, id]
      );
    } else {
      await client.query(
        `UPDATE master_acc SET is_admin=$1, is_active=$2, updated_at=now() WHERE id=$3`,
        [Boolean(is_admin), Boolean(is_active), id]
      );
    }

    // Update linked master_people if exists
    await client.query(`
      UPDATE master_people p SET
        full_name = COALESCE($1, p.full_name),
        department = COALESCE($2, p.department),
        job_title = COALESCE($3, p.job_title),
        employee_code = COALESCE($4, p.employee_code)
      FROM master_acc a
      WHERE a.id = $5 AND p.id = a.person_id
    `, [full_name?.trim() || null, department?.trim() || null, job_title?.trim() || null, employee_code?.trim() || null, id]);

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
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
    await client.query(`DELETE FROM master_acc WHERE id=$1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
