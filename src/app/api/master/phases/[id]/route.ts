import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";
import { BUILTIN_PHASE_CODES } from "@/lib/phases";

export const dynamic = "force-dynamic";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { phase_code, phase_name, color } = body;
  if (!phase_code?.trim() || !phase_name?.trim())
    return NextResponse.json({ success: false, error: "phase_code and phase_name are required" }, { status: 400 });
  if (color != null && !(typeof color === "string" && HEX_RE.test(color.trim())))
    return NextResponse.json({ success: false, error: "color must be a hex value like #3b82f6" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const before = await client.query(`SELECT phase_code, phase_name, color FROM master_phases WHERE id=$1`, [id]);
    const prev = before.rows[0];

    const { rows } = await client.query(
      `UPDATE master_phases
          SET phase_code = $1,
              phase_name = $2,
              color      = COALESCE($4, color)
        WHERE id = $3
        RETURNING *`,
      [phase_code.trim().toLowerCase(), phase_name.trim(), id, color?.trim() ?? null]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (prev && (prev.phase_code !== rows[0].phase_code || prev.phase_name !== rows[0].phase_name || prev.color !== rows[0].color)) {
      await logChange(client, {
        entityType: "master_phase",
        entityId: id,
        oldValue: `${prev.phase_code} — ${prev.phase_name}`,
        newValue: `${rows[0].phase_code} — ${rows[0].phase_name}`,
        changeSummary: `Phase "${prev.phase_name}" updated to "${rows[0].phase_name}" (${rows[0].phase_code})`,
        changedByName: await getChangedByName(),
        actionType: "master_updated",
      });
    }

    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
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
    const check = await client.query(`SELECT phase_code, phase_name FROM master_phases WHERE id=$1`, [id]);
    const phase = check.rows[0];
    if (!phase) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // The five built-in phases are structural — the Gantt/summary/detail queries
    // and the phase pipeline itself are written around them, and their rows hold
    // real project dates. Deleting one would silently destroy that data.
    if (BUILTIN_PHASE_CODES.includes(phase.phase_code)) {
      return NextResponse.json(
        { success: false, error: `"${phase.phase_name}" is a built-in phase and cannot be deleted.` },
        { status: 400 }
      );
    }

    // project_phases.phase_id is ON DELETE RESTRICT, and every project now gets
    // a row per phase, so the child rows must go first.
    await client.query("BEGIN");
    const removed = await client.query(`DELETE FROM project_phases WHERE phase_id = $1`, [id]);
    await client.query(`DELETE FROM master_phases WHERE id=$1`, [id]);

    await logChange(client, {
      entityType: "master_phase",
      entityId: id,
      oldValue: `${phase.phase_code} — ${phase.phase_name}`,
      changeSummary: `Phase "${phase.phase_name}" (${phase.phase_code}) deleted, removing it from ${removed.rowCount ?? 0} project(s)`,
      changedByName: await getChangedByName(),
      actionType: "master_deleted",
    });
    await client.query("COMMIT");

    return NextResponse.json({ success: true, removedFromProjects: removed.rowCount ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
