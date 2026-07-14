import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as {
    raw_person_name?: string;
    person_id?: number | null;
    role_code: string;
    phase_id?: string | null;
  };
  const hasPerson = body.person_id != null;
  if (!hasPerson && !body.raw_person_name?.trim()) {
    return NextResponse.json({ success: false, error: "Name or person_id required" }, { status: 400 });
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

    // A phase has a single PIC — replace any existing one for this phase.
    if (roleCode === "pic" && body.phase_id) {
      await client.query(
        `DELETE FROM project_people
         WHERE project_id = $1 AND phase_id = $2 AND role_id = $3`,
        [id, body.phase_id, roleId]
      );
    }

    const res = await client.query(
      `INSERT INTO project_people (project_id, role_id, person_id, raw_person_name, phase_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id`,
      [id, roleId, hasPerson ? body.person_id : null, hasPerson ? null : body.raw_person_name!.trim(), body.phase_id ?? null]
    );

    // Resolve the display name (linked person or raw text) for the response + log
    const { rows: [row] } = await client.query(
      `SELECT pp.id, pp.person_id, mp.full_name, mp.job_title, mp.department, mp.email,
              COALESCE(mp.full_name, pp.raw_person_name) AS display_name
       FROM project_people pp
       LEFT JOIN master_people mp ON mp.id = pp.person_id
       WHERE pp.id = $1`,
      [res.rows[0].id]
    );

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_people', $2, NULL, $3, $4, $5, $6, NOW())`,
      [
        id,
        roleCode === "pic" ? "pic" : "raw_person_name",
        row.display_name,
        `${roleCode === "pic" ? "Set PIC" : "Added stakeholder"}: ${row.display_name}`,
        user?.fullName ?? user?.email ?? "Unknown",
        roleCode === "pic" ? "pic_assigned" : "stakeholder_added",
      ]
    );

    return NextResponse.json({ success: true, data: row });
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
