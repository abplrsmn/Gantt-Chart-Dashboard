import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const [units, categories, phases, priorities, statuses] = await Promise.all([
      client.query(`SELECT id, unit_code AS code, unit_name AS name FROM master_units ORDER BY unit_name`),
      client.query(`SELECT id, category_code AS code, category_name AS name FROM master_project_categories ORDER BY category_name`),
      client.query(`SELECT id, phase_code AS code, phase_name AS name FROM master_phases ORDER BY id`),
      client.query(`SELECT id, priority_code AS code, priority_name AS name, color_hex AS color FROM master_priorities ORDER BY level`),
      client.query(`SELECT id, status_label AS name, color FROM master_statuses ORDER BY id`),
    ]);
    return NextResponse.json({
      success: true,
      units:      units.rows,
      categories: categories.rows,
      phases:     phases.rows,
      priorities: priorities.rows,
      statuses:   statuses.rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
