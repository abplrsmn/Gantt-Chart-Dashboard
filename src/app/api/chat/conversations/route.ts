import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { getOrCreateDm, MEMBERS_JSON } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** GET /api/chat/conversations — every DM/group the caller belongs to, newest activity first. */
export async function GET() {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT c.id, c.kind, c.name, c.created_at,
              ${MEMBERS_JSON} AS members,
              (SELECT json_build_object(
                        'body', x.body, 'createdAt', x.created_at,
                        'senderName', x.sender_name, 'deleted', x.deleted_at IS NOT NULL)
                 FROM chat_messages x
                WHERE x.conversation_id = c.id
                ORDER BY x.id DESC LIMIT 1) AS last_message,
              (SELECT max(x.created_at) FROM chat_messages x WHERE x.conversation_id = c.id) AS last_at
         FROM chat_conversations c
        WHERE EXISTS (SELECT 1 FROM chat_conversation_members me
                       WHERE me.conversation_id = c.id AND me.acc_id = $1)
        ORDER BY COALESCE(
                   (SELECT max(x.created_at) FROM chat_messages x WHERE x.conversation_id = c.id),
                   c.created_at
                 ) DESC`,
      [user.accId]
    );

    return NextResponse.json({
      success: true,
      me: { accId: user.accId, name: user.fullName ?? user.email },
      conversations: rows,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load conversations" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/**
 * POST /api/chat/conversations
 *   { kind: 'dm',    peerAccId }            → returns existing or new 1:1
 *   { kind: 'group', name, memberIds[] }    → creates a group (caller auto-joined)
 */
export async function POST(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let payload: { kind?: unknown; peerAccId?: unknown; name?: unknown; memberIds?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (payload.kind === "dm") {
      const peer = String(payload.peerAccId ?? "");
      if (!/^\d+$/.test(peer)) {
        return NextResponse.json({ success: false, error: "peerAccId is required" }, { status: 400 });
      }
      if (peer === String(user.accId)) {
        return NextResponse.json({ success: false, error: "Cannot DM yourself" }, { status: 400 });
      }
      const exists = await client.query(`SELECT 1 FROM master_acc WHERE id = $1 AND is_active = true`, [peer]);
      if (exists.rows.length === 0) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
      }
      await client.query("BEGIN");
      const id = await getOrCreateDm(client, user.accId, peer);
      await client.query("COMMIT");
      return NextResponse.json({ success: true, conversationId: id });
    }

    // Group
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) {
      return NextResponse.json({ success: false, error: "Group name is required" }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ success: false, error: "Group name too long" }, { status: 400 });
    }

    const memberIds = Array.isArray(payload.memberIds)
      ? [...new Set(payload.memberIds.map(String).filter((v) => /^\d+$/.test(v)))]
      : [];

    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO chat_conversations (kind, name, created_by) VALUES ('group', $1, $2) RETURNING id`,
      [name, user.accId]
    );
    const id = created.rows[0].id;

    // Caller is always a member, plus any valid active accounts requested.
    const all = [...new Set([String(user.accId), ...memberIds])];
    await client.query(
      `INSERT INTO chat_conversation_members (conversation_id, acc_id)
       SELECT $1, a.id FROM master_acc a
        WHERE a.id = ANY($2::bigint[]) AND a.is_active = true
       ON CONFLICT DO NOTHING`,
      [id, all]
    );
    await client.query("COMMIT");

    return NextResponse.json({ success: true, conversationId: String(id) });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to create conversation" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
