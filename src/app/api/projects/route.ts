import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Phase-specific date columns keyed by phase_code
const PHASE_DATE_COLS: Record<string, { start: string; end: string }> = {
  operational_brief:  { start: "received_date",       end: "normalized_deadline_date" },
  design:             { start: "start_design_date",   end: "design_approval_date"     },
  project_control:    { start: "tender_start_date",   end: "aps_spk_released_date"    },
  project_management: { start: "commence_date",       end: "end_contract_date"        },
  handover:           { start: "bast_1_date",         end: "bast_2_date"              },
};

function generateCode(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join("");
  const year     = new Date().getFullYear();
  const rand     = Math.floor(100 + Math.random() * 900);
  return `${initials}-${year}-${rand}`;
}

export async function POST(req: Request) {
  const user = await getAuthUserFromCookie();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const {
    project_name,
    unit_name,
    priority_id,
    current_phase_id,
    phase_start,
    phase_end,
    start_date,
    end_date,
    summary_brief,
    extra_phases,
  } = body as Record<string, string | number | null | undefined | { phase_id: number; start: string | null; end: string | null }[]>;

  if (!project_name || String(project_name).trim() === "") {
    return NextResponse.json({ success: false, error: "Project name is required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Resolve unit_name → unit_id (case-insensitive partial match)
    let resolvedUnitId: number | null = null;
    if (unit_name && String(unit_name).trim()) {
      const unitRes = await client.query(
        `SELECT id FROM master_units
         WHERE unit_name ILIKE $1 OR unit_code ILIKE $1
         ORDER BY unit_name LIMIT 1`,
        [`%${String(unit_name).trim()}%`]
      );
      resolvedUnitId = unitRes.rows[0]?.id ?? null;
    }

    const projectCode = generateCode(String(project_name));

    const projectRes = await client.query(
      `INSERT INTO projects
         (project_name, project_code, unit_id, priority_id,
          current_phase_id, start_date, end_date,
          summary_brief, overall_progress_pct, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, 0, NOW(), NOW())
       RETURNING id, project_code, project_name`,
      [
        String(project_name).trim(),
        projectCode,
        resolvedUnitId,
        priority_id   ? Number(priority_id)    : null,
        current_phase_id ? Number(current_phase_id) : null,
        start_date    ? String(start_date)     : null,
        end_date      ? String(end_date)       : null,
        summary_brief ? String(summary_brief).trim() : null,
      ]
    );

    const newProject = projectRes.rows[0];
    const projectId  = newProject.id;

    const changedByName = user?.fullName ?? user?.email ?? "Unknown";
    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project', NULL, NULL, NULL, $2, $3, 'project_created', NOW())`,
      [projectId, `Project "${newProject.project_name}" (${newProject.project_code}) created`, changedByName]
    );

    // Create all 5 phase rows
    await client.query(
      `INSERT INTO project_phases (project_id, phase_id, progress_pct)
       SELECT $1, id, 0 FROM master_phases ORDER BY id
       ON CONFLICT DO NOTHING`,
      [projectId]
    );

    // Write phase-specific dates if a phase is selected.
    // Falls back to overall start_date/end_date when phase dates are not provided.
    if (current_phase_id) {
      const phaseRes = await client.query(
        `SELECT phase_code FROM master_phases WHERE id = $1`,
        [Number(current_phase_id)]
      );
      const phaseCode = phaseRes.rows[0]?.phase_code as string | undefined;
      const cols = phaseCode ? PHASE_DATE_COLS[phaseCode] : null;
      const resolvedStart = phase_start ? String(phase_start) : (start_date ? String(start_date) : null);
      const resolvedEnd   = phase_end   ? String(phase_end)   : (end_date   ? String(end_date)   : null);
      if (cols && (resolvedStart || resolvedEnd)) {
        await client.query(
          `UPDATE project_phases SET ${cols.start} = $1, ${cols.end} = $2
           WHERE project_id = $3 AND phase_id = $4`,
          [resolvedStart, resolvedEnd, projectId, Number(current_phase_id)]
        );
      }
    }

    // Write dates for any extra phases provided
    if (Array.isArray(extra_phases) && extra_phases.length > 0) {
      for (const ep of extra_phases) {
        if (!ep.phase_id) continue;
        const epRes = await client.query(`SELECT phase_code FROM master_phases WHERE id = $1`, [ep.phase_id]);
        const epCode = epRes.rows[0]?.phase_code as string | undefined;
        const epCols = epCode ? PHASE_DATE_COLS[epCode] : null;
        if (epCols && (ep.start || ep.end)) {
          await client.query(
            `UPDATE project_phases SET ${epCols.start} = $1, ${epCols.end} = $2 WHERE project_id = $3 AND phase_id = $4`,
            [ep.start ?? null, ep.end ?? null, projectId, ep.phase_id]
          );
        }
      }
    }

    return NextResponse.json({ success: true, data: newProject }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
