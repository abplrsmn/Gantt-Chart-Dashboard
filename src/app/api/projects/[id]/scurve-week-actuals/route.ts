import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Per-project, per-week CUMULATIVE actual (realisasi kumulatif).
// This is an aggregate figure entered by the PM — not per task — matching the
// Excel "KUMULATIF REALISASI" row. Per-week REALISASI is derived as the diff.
async function ensureTable(client: import("pg").PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS scurve_week_actuals (
      project_id     INTEGER NOT NULL,
      week_date      DATE    NOT NULL,
      cum_actual_pct NUMERIC(9,5) NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, week_date)
    )
  `);
}

// GET — all cumulative-actual entries for the project
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await ensureTable(client);
    const { rows } = await client.query(
      `SELECT to_char(week_date, 'YYYY-MM-DD') AS week_date, cum_actual_pct
       FROM scurve_week_actuals WHERE project_id = $1 ORDER BY week_date`,
      [id]
    );
    return NextResponse.json({
      success: true,
      data: rows.map(r => ({ week_date: r.week_date, cum_actual_pct: Number(r.cum_actual_pct) })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// PATCH — upsert one week's cumulative actual
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { weekDate: string; cumActualPct: number };
  if (!body.weekDate) {
    return NextResponse.json({ success: false, error: "weekDate required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await ensureTable(client);
    await client.query(
      `INSERT INTO scurve_week_actuals (project_id, week_date, cum_actual_pct, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id, week_date)
       DO UPDATE SET cum_actual_pct = EXCLUDED.cum_actual_pct, updated_at = NOW()`,
      [id, body.weekDate, Math.max(0, body.cumActualPct ?? 0)]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

// DELETE — clear one week's cumulative actual (back to "not yet reported",
// distinct from entering 0% — 0 means reported-as-zero, absence means unset)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { weekDate: string };
  if (!body.weekDate) {
    return NextResponse.json({ success: false, error: "weekDate required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await ensureTable(client);
    await client.query(
      `DELETE FROM scurve_week_actuals WHERE project_id = $1 AND week_date = $2`,
      [id, body.weekDate]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
