import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { full_name, is_active, password, department, job_title, employee_code } = body;

  const actor = await getAuthUserFromCookie();
  const changedByName = actor?.fullName ?? actor?.email ?? "Unknown";

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const before = await client.query(`SELECT email, is_active FROM master_acc WHERE id=$1`, [id]);
    const prev = before.rows[0];

    // Update master_acc
    if (password?.trim()) {
      const hash = await bcrypt.hash(password.trim(), 12);
      await client.query(
        `UPDATE master_acc SET is_active=$1, password_hash=$2, updated_at=now() WHERE id=$3`,
        [Boolean(is_active), hash, id]
      );
      await client.query(
        `INSERT INTO project_change_logs (project_id, entity_type, entity_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
         VALUES (NULL, 'user_account', $1, 'password', NULL, NULL, $2, $3, 'password_reset', NOW())`,
        [id, `Password reset for ${prev?.email ?? "account #" + id}`, changedByName]
      );
    } else {
      await client.query(
        `UPDATE master_acc SET is_active=$1, updated_at=now() WHERE id=$2`,
        [Boolean(is_active), id]
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

    if (prev && Boolean(prev.is_active) !== Boolean(is_active)) {
      await client.query(
        `INSERT INTO project_change_logs (project_id, entity_type, entity_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
         VALUES (NULL, 'user_account', $1, 'is_active', $2, $3, $4, $5, $6, NOW())`,
        [
          id, String(Boolean(prev.is_active)), String(Boolean(is_active)),
          `Account ${prev.email} ${is_active ? "activated" : "deactivated"}`,
          changedByName,
          is_active ? "user_activated" : "user_deactivated",
        ]
      );
    }

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
  const actor = await getAuthUserFromCookie();
  const changedByName = actor?.fullName ?? actor?.email ?? "Unknown";

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const check = await client.query(`SELECT email FROM master_acc WHERE id=$1`, [id]);
    const email = check.rows[0]?.email ?? `account #${id}`;

    await client.query(`DELETE FROM master_acc WHERE id=$1`, [id]);

    try {
      await client.query(
        `INSERT INTO project_change_logs (project_id, entity_type, entity_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
         VALUES (NULL, 'user_account', $1, 'email', $2, NULL, $3, $4, 'user_deleted', NOW())`,
        [id, email, `User account "${email}" deleted`, changedByName]
      );
    } catch { /* best-effort */ }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
