import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — audit logs not tied to a single project (user accounts, master data, S-curve summaries)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page       = Math.max(1, Number(url.searchParams.get("page")  ?? 1));
  const limit      = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const entityType = url.searchParams.get("entity_type") ?? "";
  const offset     = (page - 1) * limit;

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const conditions: string[] = ["project_id IS NULL"];
    const values: unknown[]    = [];

    if (entityType) {
      values.push(entityType);
      conditions.push(`entity_type = $${values.length}`);
    }

    const where = conditions.join(" AND ");

    const [logsRes, countRes] = await Promise.all([
      client.query(
        `SELECT id, entity_type, entity_id, field_name, old_value, new_value, change_summary,
                changed_by_name, action_type, created_at
         FROM project_change_logs
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      client.query(
        `SELECT COUNT(*) AS total FROM project_change_logs WHERE ${where}`,
        values
      ),
    ]);

    const total = Number(countRes.rows[0]?.total ?? 0);

    return NextResponse.json({
      success: true,
      data: logsRes.rows,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
