import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { raw_person_name: string; role_code: string; phase_id?: string | null };
  if (!body.raw_person_name?.trim()) {
    return NextResponse.json({ success: false, error: "Name required" }, { status: 400 });
  }

  const user = await getAuthUserFromCookie();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const roleCode = body.role_code ?? "stakeholder";
    // Auto-create role if it doesn't exist yet
    try {
      await client.query(
        `INSERT INTO master_roles (role_code, role_name) VALUES ($1, $2)`,
        [roleCode, roleCode.charAt(0).toUpperCase() + roleCode.slice(1).replace(/_/g, " ")]
      );
    } catch { /* role already exists */ }
    const roleRes = await client.query(
      `SELECT id FROM master_roles WHERE role_code = $1 LIMIT 1`,
      [roleCode]
    );
    const roleId = roleRes.rows[0]?.id ?? null;

    const res = await client.query(
      `INSERT INTO project_people (project_id, role_id, raw_person_name, phase_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, raw_person_name`,
      [id, roleId, body.raw_person_name.trim(), body.phase_id ?? null]
    );

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_people', 'raw_person_name', NULL, $2, $3, $4, 'stakeholder_added', NOW())`,
      [id, body.raw_person_name.trim(), `Added stakeholder: ${body.raw_person_name.trim()}`, user?.fullName ?? user?.email ?? "Unknown"]
    );

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { personRowId } = await req.json() as { personRowId: string };

  const user = await getAuthUserFromCookie();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const check = await client.query(`SELECT raw_person_name FROM project_people WHERE id = $1 AND project_id = $2`, [personRowId, id]);
    if (!check.rows[0]) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const name = check.rows[0].raw_person_name;

    await client.query(`DELETE FROM project_people WHERE id = $1`, [personRowId]);

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_people', 'raw_person_name', $2, NULL, $3, $4, 'stakeholder_removed', NOW())`,
      [id, name, `Removed stakeholder: ${name}`, user?.fullName ?? user?.email ?? "Unknown"]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
