import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

// GET — fetch audit logs for a project (paginated)
export async function GET(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const url = new URL(req.url);
  const page    = Math.max(1, Number(url.searchParams.get("page")  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const action  = url.searchParams.get("action") ?? "";
  const offset  = (page - 1) * limit;

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const conditions: string[] = ["project_id = $1"];
    const values: unknown[]    = [id];

    if (action) {
      values.push(action);
      conditions.push(`action_type = $${values.length}`);
    }

    const where = conditions.join(" AND ");

    const [logsRes, countRes] = await Promise.all([
      client.query(
        `SELECT id, field_name, old_value, new_value, change_summary,
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
    client.release();
  }
}

// POST — write a new audit log entry
export async function POST(req: Request, { params }: { params: Params }) {
  const { id } = await params;

  // Get calling user from auth cookie
  const user = await getAuthUserFromCookie();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    field_name,
    old_value,
    new_value,
    change_summary,
    action_type,
    changed_by_name: bodyName,
  } = body as Record<string, string | undefined>;

  const VALID_ACTIONS = [
    // Creation: only for a brand-new project record.
    "project_created",

    // Updates: use these when an existing project/phase changes.
    "project_updated",
    "field_updated",
    "phase_updated",
    "phase_progressed",
    "progress_updated",
    "deadline_delayed",
    "deadline_accelerated",
    "attachment_added",

    // Backward-compatible aliases from earlier Telegram/group flows.
    "create",
    "update",
  ] as const;

  const normalizedActionType = action_type === "create"
    ? "project_created"
    : action_type === "update"
      ? "field_updated"
      : action_type;

  if (!normalizedActionType || !VALID_ACTIONS.includes(normalizedActionType as (typeof VALID_ACTIONS)[number])) {
    return NextResponse.json(
      { success: false, error: `action_type must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const changed_by_name = bodyName ?? user?.fullName ?? user?.email ?? "System";

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO project_change_logs
         (project_id, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       RETURNING *`,
      [id, field_name ?? null, old_value ?? null, new_value ?? null,
       change_summary ?? null, changed_by_name, normalizedActionType]
    );
    return NextResponse.json({ success: true, data: res.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}
