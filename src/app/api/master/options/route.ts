import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    // Ensure exactly our 3 project statuses exist
    await client.query(`
      INSERT INTO master_statuses (status_label, color)
      SELECT v.label, v.color FROM (VALUES
        ('Active',     '#22c55e'),
        ('Not Active', '#94a3b8'),
        ('Done',       '#3b82f6')
      ) AS v(label, color)
      WHERE NOT EXISTS (SELECT 1 FROM master_statuses WHERE status_label = v.label)
    `);

    const [units, categories, phases, priorities, statuses] = await Promise.all([
      client.query(`SELECT id, unit_code AS code, unit_name AS name FROM master_units ORDER BY unit_name`),
      client.query(`SELECT id, category_code AS code, category_name AS name FROM master_project_categories ORDER BY category_name`),
      client.query(`SELECT id, phase_code AS code, phase_name AS name FROM master_phases ORDER BY id`),
      client.query(`SELECT id, priority_code AS code, priority_name AS name, color_hex AS color FROM master_priorities ORDER BY level`),
      client.query(`SELECT id, status_label AS name, color FROM master_statuses WHERE status_label IN ('Active','Not Active','Done') ORDER BY CASE status_label WHEN 'Active' THEN 1 WHEN 'Not Active' THEN 2 WHEN 'Done' THEN 3 END`),
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
