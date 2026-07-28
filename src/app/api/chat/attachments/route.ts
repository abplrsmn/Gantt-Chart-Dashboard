import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember, MESSAGE_SELECT } from "@/lib/chat";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Extension allowlist. Uploads are served statically from /public, so
 * anything HTML/SVG/script-capable is deliberately excluded — an uploaded
 * .html or .svg would execute in the uploader's own origin if another user
 * opened it directly, unlike project attachments (which currently accept
 * anything). Chat attachments are higher-frequency and more casual, so the
 * stricter allowlist here is intentional rather than an oversight.
 */
const ALLOWED_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip",
]);

/** POST /api/chat/attachments — multipart upload; creates a message carrying the file. */
export async function POST(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const conversationId = String(formData.get("conversationId") ?? "");
  const caption = typeof formData.get("caption") === "string" ? String(formData.get("caption")).trim() : "";
  const file = formData.get("file") as File | null;

  if (!/^\d+$/.test(conversationId)) {
    return NextResponse.json({ success: false, error: "conversationId is required" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "File too large (max 15MB)" }, { status: 400 });
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { success: false, error: `File type ".${ext}" isn't allowed. Allowed: images, PDF, Office docs, CSV, TXT, ZIP.` },
      { status: 400 }
    );
  }
  if (caption.length > 4000) {
    return NextResponse.json({ success: false, error: "Caption too long (max 4000 chars)" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (!(await isMember(client, conversationId, user.accId))) {
      return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), "public", "uploads", "chat", conversationId);
    await mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}_${safeName}`;
    await writeFile(path.join(uploadDir, fileName), buffer);
    const attachmentUrl = `/uploads/chat/${conversationId}/${fileName}`;

    const inserted = await client.query(
      `INSERT INTO chat_messages
         (room, conversation_id, acc_id, sender_name, role, body,
          attachment_url, attachment_name, attachment_mime, attachment_size)
       VALUES ('team', $1, $2, $3, 'user', $4, $5, $6, $7, $8)
       RETURNING id`,
      [conversationId, user.accId, user.fullName ?? user.email ?? "Unknown", caption, attachmentUrl, file.name, file.type || null, file.size]
    );

    const { rows } = await client.query(`${MESSAGE_SELECT} WHERE m.id = $1`, [inserted.rows[0].id]);
    return NextResponse.json({ success: true, message: { ...rows[0], mine: true } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
