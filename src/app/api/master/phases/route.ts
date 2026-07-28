import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, phase_code, phase_name, phase_order, color FROM master_phases ORDER BY phase_order, id`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

/** Accepts #rgb / #rrggbb; anything else falls back to the default. */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_PHASE_COLOR = "#8b5cf6";

export async function POST(req: Request) {
  const body = await req.json();
  const { phase_code, phase_name, color } = body;
  if (!phase_code?.trim() || !phase_name?.trim())
    return NextResponse.json({ success: false, error: "phase_code and phase_name are required" }, { status: 400 });

  const safeColor = typeof color === "string" && HEX_RE.test(color.trim()) ? color.trim() : DEFAULT_PHASE_COLOR;

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    // phase_order is NOT NULL with no DB default — append the new phase to the
    // end of the pipeline rather than letting the insert fail.
    const { rows } = await client.query(
      `INSERT INTO master_phases (phase_code, phase_name, phase_order, color)
       VALUES ($1, $2, COALESCE((SELECT MAX(phase_order) FROM master_phases), 0) + 1, $3)
       RETURNING *`,
      [phase_code.trim().toLowerCase(), phase_name.trim(), safeColor]
    );

    // Backfill a project_phases row for every existing project. Project
    // creation seeds rows for all master_phases, so without this a new phase
    // would only ever appear on projects created *after* it was added.
    const backfill = await client.query(
      `INSERT INTO project_phases (project_id, phase_id, progress_pct)
       SELECT p.id, $1, 0 FROM projects p
       ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );

    await logChange(client, {
      entityType: "master_phase",
      entityId: rows[0].id,
      newValue: rows[0].phase_name,
      changeSummary: `Phase "${rows[0].phase_name}" (${rows[0].phase_code}) created and applied to ${backfill.rowCount ?? 0} existing project(s)`,
      changedByName: await getChangedByName(),
      actionType: "master_created",
    });
    return NextResponse.json({ success: true, data: rows[0], backfilled: backfill.rowCount ?? 0 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
