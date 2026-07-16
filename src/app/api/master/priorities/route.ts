import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, priority_code, priority_name, color_hex, level FROM master_priorities ORDER BY level`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { priority_code, priority_name, color_hex, level } = body;
  if (!priority_code?.trim() || !priority_name?.trim())
    return NextResponse.json({ success: false, error: "priority_code and priority_name are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO master_priorities (priority_code, priority_name, color_hex, level) VALUES ($1, $2, $3, $4) RETURNING *`,
      [priority_code.trim().toUpperCase(), priority_name.trim(), color_hex || "#94a3b8", level || 99]
    );
    await logChange(client, {
      entityType: "master_priority",
      entityId: rows[0].id,
      newValue: rows[0].priority_name,
      changeSummary: `Priority "${rows[0].priority_name}" (${rows[0].priority_code}) created`,
      changedByName: await getChangedByName(),
      actionType: "master_created",
    });
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
