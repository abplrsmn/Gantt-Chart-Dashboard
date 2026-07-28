import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember } from "@/lib/chat";

export const dynamic = "force-dynamic";

const MESSAGE_COLUMNS = `
  id, room, conversation_id, acc_id, sender_name, role, body,
  created_at, edited_at, deleted_at, pinned_at, pinned_by,
  is_forwarded, forwarded_from, reply_to,
  attachment_url, attachment_name, attachment_mime, attachment_size
`;

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/chat/messages/[id]
 *   { body }            → edit text (author only)
 *   { pinned: boolean } → pin/unpin (any member of the conversation)
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid message id" }, { status: 400 });
  }

  let payload: { body?: unknown; pinned?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const found = await client.query(
      `SELECT id, acc_id, conversation_id, deleted_at, role FROM chat_messages WHERE id = $1`,
      [id]
    );
    const msg = found.rows[0];
    if (!msg) return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 });
    if (!msg.conversation_id) {
      return NextResponse.json(
        { success: false, error: "AI thread messages cannot be edited or pinned" },
        { status: 400 }
      );
    }
    if (!(await isMember(client, msg.conversation_id, user.accId))) {
      return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
    }
    if (msg.deleted_at) {
      return NextResponse.json({ success: false, error: "Message was deleted" }, { status: 400 });
    }

    // ── Pin / unpin ─────────────────────────────────────────────────────────
    if (typeof payload.pinned === "boolean") {
      const { rows } = await client.query(
        payload.pinned
          ? `UPDATE chat_messages SET pinned_at = now(), pinned_by = $2 WHERE id = $1 RETURNING ${MESSAGE_COLUMNS}`
          : `UPDATE chat_messages SET pinned_at = NULL, pinned_by = NULL WHERE id = $1 RETURNING ${MESSAGE_COLUMNS}`,
        payload.pinned ? [id, user.fullName ?? user.email ?? "Unknown"] : [id]
      );
      return NextResponse.json({
        success: true,
        message: { ...rows[0], mine: String(rows[0].acc_id ?? "") === String(user.accId) },
      });
    }

    // ── Edit body (author only) ─────────────────────────────────────────────
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) {
      return NextResponse.json({ success: false, error: "Message cannot be empty" }, { status: 400 });
    }
    if (body.length > 4000) {
      return NextResponse.json({ success: false, error: "Message too long (max 4000 chars)" }, { status: 400 });
    }
    if (String(msg.acc_id ?? "") !== String(user.accId)) {
      return NextResponse.json(
        { success: false, error: "You can only edit your own messages" },
        { status: 403 }
      );
    }

    const { rows } = await client.query(
      `UPDATE chat_messages SET body = $2, edited_at = now() WHERE id = $1 RETURNING ${MESSAGE_COLUMNS}`,
      [id, body]
    );
    return NextResponse.json({ success: true, message: { ...rows[0], mine: true } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to update message" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/chat/messages/[id] — soft-deletes (author only), so the thread
 * keeps a "message was deleted" placeholder instead of a hole in the history.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid message id" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const found = await client.query(
      `SELECT id, acc_id, conversation_id FROM chat_messages WHERE id = $1`,
      [id]
    );
    const msg = found.rows[0];
    if (!msg) return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 });
    if (String(msg.acc_id ?? "") !== String(user.accId)) {
      return NextResponse.json(
        { success: false, error: "You can only delete your own messages" },
        { status: 403 }
      );
    }

    const { rows } = await client.query(
      `UPDATE chat_messages
          SET deleted_at = now(), body = '', pinned_at = NULL, pinned_by = NULL,
              attachment_url = NULL, attachment_name = NULL, attachment_mime = NULL, attachment_size = NULL
        WHERE id = $1
        RETURNING ${MESSAGE_COLUMNS}`,
      [id]
    );
    return NextResponse.json({ success: true, message: { ...rows[0], mine: true } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to delete message" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
