import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS project_week_progress (
      id           bigserial PRIMARY KEY,
      project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      week_key     varchar(20) NOT NULL,  -- e.g. "week-2026-06-02"
      plan_pct     numeric(6,2) DEFAULT 0,
      actual_pct   numeric(6,2) DEFAULT 0,
      status       varchar(50)  DEFAULT 'Not started',
      notes        text,
      updated_at   timestamptz  NOT NULL DEFAULT now(),
      UNIQUE (project_id, week_key)
    )
  `);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query(
      `SELECT week_key, plan_pct, actual_pct, status, notes FROM project_week_progress WHERE project_id = $1`,
      [id]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as {
    week_key: string;
    plan_pct?: number | null;
    actual_pct?: number | null;
    status?: string | null;
    notes?: string | null;
  };

  if (!body.week_key) {
    return NextResponse.json({ success: false, error: "week_key is required" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query(
      `INSERT INTO project_week_progress (project_id, week_key, plan_pct, actual_pct, status, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (project_id, week_key) DO UPDATE SET
         plan_pct   = COALESCE(EXCLUDED.plan_pct,   project_week_progress.plan_pct),
         actual_pct = COALESCE(EXCLUDED.actual_pct, project_week_progress.actual_pct),
         status     = COALESCE(EXCLUDED.status,     project_week_progress.status),
         notes      = COALESCE(EXCLUDED.notes,      project_week_progress.notes),
         updated_at = now()
       RETURNING week_key, plan_pct, actual_pct, status, notes`,
      [id, body.week_key, body.plan_pct ?? null, body.actual_pct ?? null, body.status ?? null, body.notes ?? null]
    );
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
