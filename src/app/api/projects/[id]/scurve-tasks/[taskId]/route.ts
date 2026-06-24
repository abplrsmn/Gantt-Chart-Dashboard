import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`DELETE FROM scurve_tasks WHERE id = $1 AND project_id = $2`, [taskId, id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const body = await req.json() as { name?: string; unit?: string; vol?: string; bobot?: number };
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      UPDATE scurve_tasks
      SET name = COALESCE($1, name),
          unit = COALESCE($2, unit),
          vol  = COALESCE($3, vol),
          bobot = COALESCE($4, bobot),
          updated_at = NOW()
      WHERE id = $5 AND project_id = $6
    `, [body.name ?? null, body.unit ?? null, body.vol ?? null, body.bobot ?? null, taskId, id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
