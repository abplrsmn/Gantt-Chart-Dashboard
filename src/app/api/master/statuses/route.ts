import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, entity_type, status_code, status_label, color FROM master_statuses ORDER BY id`
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
  const { entity_type, status_code, status_label, color } = body;
  if (!status_code?.trim() || !status_label?.trim())
    return NextResponse.json({ success: false, error: "status_code and status_label are required" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO master_statuses (entity_type, status_code, status_label, color) VALUES ($1, $2, $3, $4) RETURNING *`,
      [entity_type?.trim() || "project", status_code.trim().toLowerCase(), status_label.trim(), color || "#94a3b8"]
    );
    return NextResponse.json({ success: true, data: rows[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
