import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`DELETE FROM scurve_steps WHERE id = $1 AND project_id = $2`, [stepId, id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { id, stepId } = await params;
  const { name } = await req.json() as { name: string };
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(
      `UPDATE scurve_steps SET name = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3`,
      [name.trim(), stepId, id]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
