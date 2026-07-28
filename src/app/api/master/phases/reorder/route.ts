import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/master/phases/reorder  { ids: [phaseId, …] }
 *
 * Rewrites phase_order to match the given sequence (1..N). Phases are a
 * sequential milestone pipeline, so this order is real data — it drives the
 * board column order, the phase stepper, and progress ("phase 3 of 6").
 *
 * The whole set is renumbered in one transaction rather than swapping pairs,
 * which keeps the ordering dense and gap-free no matter how rows are dragged.
 */
export async function PATCH(req: Request) {
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  if (!ids || ids.length === 0 || !ids.every(id => /^\d+$/.test(id))) {
    return NextResponse.json({ success: false, error: "ids must be a non-empty array of phase ids" }, { status: 400 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ success: false, error: "ids contains duplicates" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT id, phase_name, phase_order FROM master_phases`);
    // Reordering a partial list would leave the rest with stale/colliding
    // positions, so require the full set.
    if (existing.rows.length !== ids.length) {
      return NextResponse.json(
        { success: false, error: `Expected all ${existing.rows.length} phases, got ${ids.length}` },
        { status: 400 }
      );
    }
    const knownIds = new Set(existing.rows.map(r => String(r.id)));
    const unknown = ids.filter(id => !knownIds.has(id));
    if (unknown.length) {
      return NextResponse.json({ success: false, error: `Unknown phase id(s): ${unknown.join(", ")}` }, { status: 400 });
    }

    await client.query("BEGIN");
    // Two passes: phase_order may carry a UNIQUE constraint, and even without
    // one this avoids transient collisions mid-update. Offset far past the
    // current max, then settle to 1..N.
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE master_phases SET phase_order = $1 WHERE id = $2`, [1000 + i, ids[i]]);
    }
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE master_phases SET phase_order = $1, updated_at = now() WHERE id = $2`, [i + 1, ids[i]]);
    }

    const { rows } = await client.query(
      `SELECT id, phase_code, phase_name, phase_order, color FROM master_phases ORDER BY phase_order, id`
    );

    const nameById = new Map(existing.rows.map(r => [String(r.id), r.phase_name as string]));
    await logChange(client, {
      entityType: "master_phase",
      changeSummary: `Phase order changed to: ${ids.map(id => nameById.get(id) ?? id).join(" → ")}`,
      changedByName: await getChangedByName(),
      actionType: "master_updated",
    });
    await client.query("COMMIT");

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
