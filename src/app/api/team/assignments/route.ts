import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/team/assignments — one row per (person, project) pairing, for the
 * team directory to show "what is this person working on".
 *
 * project_people is only sparsely linked by person_id (most rows were
 * imported as free-text raw_person_name), so a person is matched either by
 * the FK or by case-insensitive full-name match — the same fallback already
 * used by the Gantt PIC columns and the AI assistant's team context.
 */
export async function GET() {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT DISTINCT
              mp.id AS person_id,
              p.id AS project_id,
              p.project_code,
              p.project_name,
              p.overall_progress_pct,
              mph.phase_name,
              ms.status_label,
              ms.color AS status_color,
              mr.role_name
         FROM project_people pp
         JOIN projects p ON p.id = pp.project_id
         JOIN master_people mp
           ON mp.id = pp.person_id
           OR (pp.person_id IS NULL AND lower(mp.full_name) = lower(pp.raw_person_name))
         LEFT JOIN master_roles   mr  ON mr.id = pp.role_id
         LEFT JOIN master_phases  mph ON mph.id = p.current_phase_id
         LEFT JOIN master_statuses ms ON ms.id = p.overall_status_id
        ORDER BY p.project_code`
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load assignments" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
