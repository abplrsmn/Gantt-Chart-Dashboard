import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUserFromCookie();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Save to public/uploads/project-{id}/
  const uploadDir = path.join(process.cwd(), "public", "uploads", `project-${id}`);
  await mkdir(uploadDir, { recursive: true });

  // Sanitize filename
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const fileName  = `${timestamp}_${safeName}`;
  const filePath  = path.join(uploadDir, fileName);
  await writeFile(filePath, buffer);

  const fileUrl = `/uploads/project-${id}/${fileName}`;

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const res = await client.query(
      `INSERT INTO project_attachments
         (project_id, file_name, file_type, mime_type, file_url, file_size_bytes, source_channel, uploaded_by_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'web_upload', $7, NOW())
       RETURNING id, file_name, file_type, mime_type, file_url, file_size_bytes, source_channel, uploaded_by_name, created_at`,
      [id, file.name, file.name.split(".").pop() ?? null, file.type || null, fileUrl, file.size, user?.fullName ?? user?.email ?? "Unknown"]
    );

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_attachments', 'file_url', NULL, $2, $3, $4, 'attachment_added', NOW())`,
      [id, fileUrl, `Attached file: ${file.name}`, user?.fullName ?? user?.email ?? "Unknown"]
    );

    return NextResponse.json({ success: true, data: res.rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attachmentId } = await req.json() as { attachmentId: string };
  const user = await getAuthUserFromCookie();

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const check = await client.query(
      `SELECT file_name, file_url FROM project_attachments WHERE id = $1 AND project_id = $2`,
      [attachmentId, id]
    );
    if (!check.rows[0]) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    await client.query(`DELETE FROM project_attachments WHERE id = $1`, [attachmentId]);

    await client.query(
      `INSERT INTO project_change_logs (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
       VALUES ($1, 'project_attachments', 'file_url', $2, NULL, $3, $4, 'attachment_removed', NOW())`,
      [id, check.rows[0].file_url, `Removed file: ${check.rows[0].file_name}`, user?.fullName ?? user?.email ?? "Unknown"]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
