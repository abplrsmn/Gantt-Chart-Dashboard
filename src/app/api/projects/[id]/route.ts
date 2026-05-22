import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: false,
});

type FieldMap = { table: "projects" | "project_phases"; column: string; phaseId?: number };

const FIELD_MAP: Record<string, FieldMap> = {
  project_name:                 { table: "projects",       column: "project_name" },
  start_date:                   { table: "projects",       column: "start_date" },
  end_date:                     { table: "projects",       column: "end_date" },
  budget_capex:                 { table: "projects",       column: "budget_capex" },
  contract_amount:              { table: "projects",       column: "contract_amount" },
  summary_brief:                { table: "projects",       column: "summary_brief" },
  blocker_note:                 { table: "projects",       column: "blocker_note" },
  next_action_note:             { table: "projects",       column: "next_action_note" },
  brief_received:               { table: "project_phases", column: "received_date",                  phaseId: 1 },
  brief_deadline:               { table: "project_phases", column: "normalized_deadline_date",        phaseId: 1 },
  brief_notes:                  { table: "project_phases", column: "notes",                          phaseId: 1 },
  operational_brief:            { table: "project_phases", column: "brief_text",                     phaseId: 1 },
  design_start:                 { table: "project_phases", column: "start_design_date",              phaseId: 2 },
  design_end:                   { table: "project_phases", column: "design_approval_date",           phaseId: 2 },
  working_drawing_status:       { table: "project_phases", column: "working_drawing_status",         phaseId: 2 },
  design_notes:                 { table: "project_phases", column: "notes",                          phaseId: 2 },
  design_brief:                 { table: "project_phases", column: "brief_text",                     phaseId: 2 },
  control_start:                { table: "project_phases", column: "tender_start_date",              phaseId: 3 },
  control_end:                  { table: "project_phases", column: "aps_spk_released_date",          phaseId: 3 },
  phase_contract_amount:        { table: "project_phases", column: "phase_contract_amount",          phaseId: 3 },
  control_notes:                { table: "project_phases", column: "notes",                          phaseId: 3 },
  pm_start:                     { table: "project_phases", column: "commence_date",                  phaseId: 4 },
  pm_end:                       { table: "project_phases", column: "end_contract_date",              phaseId: 4 },
  deviation_days:               { table: "project_phases", column: "deviation_days",                 phaseId: 4 },
  current_site_progress:        { table: "project_phases", column: "current_site_progress",          phaseId: 4 },
  pm_notes:                     { table: "project_phases", column: "notes",                          phaseId: 4 },
  pm_remarks:                   { table: "project_phases", column: "notes",                          phaseId: 4 },
  handover_start:               { table: "project_phases", column: "bast_1_date",                   phaseId: 5 },
  handover_end:                 { table: "project_phases", column: "bast_2_date",                   phaseId: 5 },
  actual_phase_completion_date: { table: "project_phases", column: "actual_phase_completion_date",   phaseId: 5 },
  handover_notes:               { table: "project_phases", column: "notes",                          phaseId: 5 },
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { field: string; value: string | null };
  const map = FIELD_MAP[body.field];
  if (!map) return NextResponse.json({ success: false, error: "Unknown field" }, { status: 400 });

  const user = await getAuthUserFromCookie();
  const changedByName = user?.fullName ?? user?.email ?? "Unknown";

  const client = await pool.connect();
  try {
    // Fetch old value before update
    let oldValue: string | null = null;
    if (map.table === "projects") {
      const oldRes = await client.query(
        `SELECT ${map.column} FROM projects WHERE id = $1`,
        [id]
      );
      oldValue = oldRes.rows[0]?.[map.column] ?? null;
      if (oldValue != null) oldValue = String(oldValue);

      await client.query(
        `UPDATE projects SET ${map.column} = $1, updated_at = NOW() WHERE id = $2`,
        [body.value ?? null, id]
      );
    } else {
      const oldRes = await client.query(
        `SELECT ${map.column} FROM project_phases WHERE project_id = $1 AND phase_id = $2`,
        [id, map.phaseId]
      );
      oldValue = oldRes.rows[0]?.[map.column] ?? null;
      if (oldValue != null) oldValue = String(oldValue);

      await client.query(
        `UPDATE project_phases SET ${map.column} = $1, updated_at = NOW()
         WHERE project_id = $2 AND phase_id = $3`,
        [body.value ?? null, id, map.phaseId]
      );
    }

    // Insert audit log
    await client.query(
      `INSERT INTO project_change_logs
         (project_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'update')`,
      [
        id,
        body.field,
        oldValue,
        body.value ?? null,
        `Updated ${body.field}`,
        changedByName,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await pool.connect();
  try {
    const [projectRes, peopleRes, logsRes, attachmentsRes] = await Promise.all([
      client.query(`
        SELECT
          p.id, p.project_code, p.project_name, p.overall_progress_pct,
          p.start_date, p.end_date, p.budget_capex, p.contract_amount,
          p.summary_brief, p.blocker_note, p.next_action_note,
          mp_phase.phase_name   AS current_phase_name,
          mp_phase.phase_code   AS current_phase_code,
          ms.status_label, ms.color AS status_color,
          mpr.priority_name, mpr.priority_code, mpr.color_hex AS priority_color,
          mu.unit_code, mu.unit_name,
          mc.category_name,

          ob.normalized_deadline_date AS brief_deadline,
          ob.received_date            AS brief_received,
          ob.progress_pct             AS brief_progress,
          ob.notes                    AS brief_notes,

          ds.start_design_date        AS design_start,
          ds.design_approval_date     AS design_end,
          ds.progress_pct             AS design_progress,
          ds.working_drawing_status,
          ds.notes                    AS design_notes,

          pc.tender_start_date        AS control_start,
          pc.aps_spk_released_date    AS control_end,
          pc.progress_pct             AS control_progress,
          pc.phase_contract_amount,
          pc.notes                    AS control_notes,

          pm.commence_date            AS pm_start,
          pm.end_contract_date        AS pm_end,
          pm.progress_pct             AS pm_progress,
          pm.deviation_days,
          pm.current_site_progress,
          pm.notes                    AS pm_notes,

          hv.bast_1_date              AS handover_start,
          hv.bast_2_date              AS handover_end,
          hv.progress_pct             AS handover_progress,
          hv.actual_phase_completion_date,
          hv.notes                    AS handover_notes

        FROM projects p
        LEFT JOIN master_phases mp_phase       ON mp_phase.id = p.current_phase_id
        LEFT JOIN master_statuses ms           ON ms.id = p.overall_status_id
        LEFT JOIN master_priorities mpr        ON mpr.id = p.priority_id
        LEFT JOIN master_units mu              ON mu.id = p.unit_id
        LEFT JOIN master_project_categories mc ON mc.id = p.category_id
        LEFT JOIN project_phases ob  ON ob.project_id = p.id AND ob.phase_id = 1
        LEFT JOIN project_phases ds  ON ds.project_id = p.id AND ds.phase_id = 2
        LEFT JOIN project_phases pc  ON pc.project_id = p.id AND pc.phase_id = 3
        LEFT JOIN project_phases pm  ON pm.project_id = p.id AND pm.phase_id = 4
        LEFT JOIN project_phases hv  ON hv.project_id = p.id AND hv.phase_id = 5
        WHERE p.id = $1
      `, [id]),

      client.query(`
        SELECT pp.id, pp.raw_person_name, pp.raw_organization_name,
               pp.is_primary, pp.notes,
               pp.phase_id AS phase_row_id,
               pph.phase_id::int AS phase_id,
               pp.created_at, pp.updated_at,
               mr.role_code, mr.role_name,
               mp.full_name, mp.job_title, mp.department, mp.email
        FROM project_people pp
        LEFT JOIN master_roles mr  ON mr.id = pp.role_id
        LEFT JOIN master_people mp ON mp.id = pp.person_id
        LEFT JOIN project_phases pph ON pph.id = pp.phase_id
        WHERE pp.project_id = $1
        ORDER BY mr.id, pp.is_primary DESC
      `, [id]),

      client.query(`
        SELECT id, field_name, old_value, new_value, change_summary,
               changed_by_name, action_type, created_at
        FROM project_change_logs
        WHERE project_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [id]),

      client.query(`
        SELECT
          pa.id,
          pa.file_name,
          pa.file_type,
          pa.mime_type,
          pa.file_url,
          pa.file_size_bytes,
          pa.source_channel,
          pa.source_message_id,
          pa.uploaded_by_name,
          pa.created_at,
          mp.phase_name
        FROM project_attachments pa
        LEFT JOIN project_phases pp ON pp.id = pa.phase_id
        LEFT JOIN master_phases mp ON mp.id = pp.phase_id
        WHERE pa.project_id = $1
        ORDER BY pa.created_at DESC, pa.id DESC
      `, [id]),
    ]);

    if (projectRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        project: projectRes.rows[0],
        people: peopleRes.rows,
        logs: logsRes.rows,
        attachments: attachmentsRes.rows,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
