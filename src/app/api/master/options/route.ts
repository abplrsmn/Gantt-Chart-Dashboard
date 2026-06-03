import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    // Ensure default priorities exist
    await client.query(`
      INSERT INTO master_priorities (priority_code, priority_name, color_hex, level)
      SELECT v.code, v.name, v.color, v.level FROM (VALUES
        ('CRITICAL', 'Critical', '#ef4444', 1),
        ('HIGH',     'High',     '#f97316', 2),
        ('MID',      'Mid',      '#eab308', 3),
        ('LOW',      'Low',      '#22c55e', 4)
      ) AS v(code, name, color, level)
      WHERE NOT EXISTS (SELECT 1 FROM master_priorities WHERE priority_code = v.code)
    `);


    const [units, categories, phases, priorities, statuses] = await Promise.all([
      client.query(`SELECT id, unit_code AS code, unit_name AS name FROM master_units ORDER BY unit_name`),
      client.query(`SELECT id, category_code AS code, category_name AS name FROM master_project_categories ORDER BY category_name`),
      client.query(`SELECT id, phase_code AS code, phase_name AS name FROM master_phases ORDER BY id`),
      client.query(`SELECT id, priority_code AS code, priority_name AS name, color_hex AS color FROM master_priorities ORDER BY level`),
      client.query(`SELECT DISTINCT ON (status_label) id, status_label AS name, color FROM master_statuses ORDER BY status_label, id`),
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
