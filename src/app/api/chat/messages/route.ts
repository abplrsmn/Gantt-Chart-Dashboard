import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember, MESSAGE_SELECT } from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/messages?conversationId=<id>   → a DM/group thread (membership enforced)
 * GET /api/chat/messages?room=ai               → the caller's private AI thread
 */
export async function GET(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const isAi = searchParams.get("room") === "ai";

  if (!conversationId && !isAi) {
    return NextResponse.json(
      { success: false, error: "conversationId or room=ai is required" },
      { status: 400 }
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    let rows;
    if (isAi) {
      ({ rows } = await client.query(
        `${MESSAGE_SELECT}
          WHERE m.room = 'ai' AND m.acc_id = $1
          ORDER BY m.id ASC LIMIT 500`,
        [user.accId]
      ));
    } else {
      if (!/^\d+$/.test(conversationId!)) {
        return NextResponse.json({ success: false, error: "Invalid conversationId" }, { status: 400 });
      }
      if (!(await isMember(client, conversationId!, user.accId))) {
        return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
      }
      ({ rows } = await client.query(
        `${MESSAGE_SELECT}
          WHERE m.conversation_id = $1
          ORDER BY m.id ASC LIMIT 500`,
        [conversationId]
      ));
    }

    return NextResponse.json({
      success: true,
      me: { accId: user.accId, name: user.fullName ?? user.email },
      messages: rows.map((r) => ({
        ...r,
        // Deleted bodies/attachments must never reach the client.
        body: r.deleted_at ? "" : r.body,
        attachment_url: r.deleted_at ? null : r.attachment_url,
        mine: String(r.acc_id ?? "") === String(user.accId) && r.role !== "assistant",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load messages" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * POST /api/chat/messages
 *   { conversationId, body }              → normal message
 *   { conversationId, body, replyTo }     → reply quoting an earlier message
 *   { conversationId, forwardOf: msgId }  → forwards an existing message
 *
 * Forwarding re-reads the source body server-side (and verifies the caller can
 * actually see it) rather than trusting a client-supplied body — otherwise
 * "forward" would be a way to post arbitrary text attributed as a forward.
 */
export async function POST(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let payload: { conversationId?: unknown; body?: unknown; forwardOf?: unknown; replyTo?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const conversationId = String(payload.conversationId ?? "");
  const forwardOf = payload.forwardOf != null ? String(payload.forwardOf) : "";
  const replyTo = payload.replyTo != null ? String(payload.replyTo) : "";
  let body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!/^\d+$/.test(conversationId)) {
    return NextResponse.json({ success: false, error: "conversationId is required" }, { status: 400 });
  }
  if (forwardOf && !/^\d+$/.test(forwardOf)) {
    return NextResponse.json({ success: false, error: "Invalid forwardOf id" }, { status: 400 });
  }
  if (replyTo && !/^\d+$/.test(replyTo)) {
    return NextResponse.json({ success: false, error: "Invalid replyTo id" }, { status: 400 });
  }
  if (!forwardOf) {
    if (!body) {
      return NextResponse.json({ success: false, error: "Message cannot be empty" }, { status: 400 });
    }
    if (body.length > 4000) {
      return NextResponse.json({ success: false, error: "Message too long (max 4000 chars)" }, { status: 400 });
    }
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (!(await isMember(client, conversationId, user.accId))) {
      return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
    }

    let fwdAttachment: { url: string | null; name: string | null; mime: string | null; size: number | null } = {
      url: null, name: null, mime: null, size: null,
    };

    if (forwardOf) {
      const src = await client.query(
        `SELECT id, body, conversation_id, room, acc_id, deleted_at,
                attachment_url, attachment_name, attachment_mime, attachment_size
           FROM chat_messages WHERE id = $1`,
        [forwardOf]
      );
      const source = src.rows[0];
      if (!source) {
        return NextResponse.json({ success: false, error: "Original message not found" }, { status: 404 });
      }
      if (source.deleted_at) {
        return NextResponse.json({ success: false, error: "Cannot forward a deleted message" }, { status: 400 });
      }
      // Caller must be able to see the source: either their own AI thread, or a
      // conversation they belong to.
      const canRead = source.conversation_id
        ? await isMember(client, source.conversation_id, user.accId)
        : String(source.acc_id ?? "") === String(user.accId);
      if (!canRead) {
        return NextResponse.json({ success: false, error: "You cannot forward that message" }, { status: 403 });
      }
      body = source.body;
      // Forwarding an attachment points at the same stored file rather than
      // copying bytes — it's just a reference, and the source message (if
      // still undeleted) keeps its own independent copy of these columns.
      fwdAttachment = {
        url: source.attachment_url, name: source.attachment_name,
        mime: source.attachment_mime, size: source.attachment_size,
      };
    }

    // A reply may only quote a message from the same conversation.
    if (replyTo) {
      const target = await client.query(
        `SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2`,
        [replyTo, conversationId]
      );
      if (target.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "Cannot reply to a message from another conversation" },
          { status: 400 }
        );
      }
    }

    const inserted = await client.query(
      `INSERT INTO chat_messages
         (room, conversation_id, acc_id, sender_name, role, body, is_forwarded, forwarded_from, reply_to,
          attachment_url, attachment_name, attachment_mime, attachment_size)
       VALUES ('team', $1, $2, $3, 'user', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        conversationId,
        user.accId,
        user.fullName ?? user.email ?? "Unknown",
        body,
        Boolean(forwardOf),
        forwardOf || null,
        replyTo || null,
        fwdAttachment.url,
        fwdAttachment.name,
        fwdAttachment.mime,
        fwdAttachment.size,
      ]
    );

    // Re-select through the join so the response carries the reply preview.
    const { rows } = await client.query(`${MESSAGE_SELECT} WHERE m.id = $1`, [inserted.rows[0].id]);
    return NextResponse.json({ success: true, message: { ...rows[0], mine: true } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to send message" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/** DELETE /api/chat/messages?room=ai — clears the caller's AI thread. */
export async function DELETE(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("room") !== "ai") {
    return NextResponse.json(
      { success: false, error: "Only the AI thread can be bulk-cleared" },
      { status: 400 }
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM chat_messages WHERE room = 'ai' AND acc_id = $1`,
      [user.accId]
    );
    return NextResponse.json({ success: true, deleted: rowCount ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to clear thread" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
