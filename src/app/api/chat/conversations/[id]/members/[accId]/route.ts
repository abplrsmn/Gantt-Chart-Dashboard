import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember, MEMBERS_JSON } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; accId: string }> };

/**
 * DELETE /api/chat/conversations/[id]/members/[accId] — removes a member.
 * Any current member can remove any other member (consistent with the rest
 * of this app: no owner/admin role model, PM and Admin are permission-equal
 * everywhere else). Removing yourself is how you "leave" a group.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id, accId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(accId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (!(await isMember(client, id, user.accId))) {
      return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
    }
    const conv = await client.query(`SELECT kind FROM chat_conversations WHERE id = $1`, [id]);
    if (!conv.rows[0]) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });
    if (conv.rows[0].kind !== "group") {
      return NextResponse.json({ success: false, error: "Only groups have members added/removed" }, { status: 400 });
    }

    const { rowCount } = await client.query(
      `DELETE FROM chat_conversation_members WHERE conversation_id = $1 AND acc_id = $2`,
      [id, accId]
    );
    if (!rowCount) {
      return NextResponse.json({ success: false, error: "That user is not a member" }, { status: 404 });
    }

    const { rows } = await client.query(
      `SELECT c.id, c.kind, c.name, c.created_at, ${MEMBERS_JSON} AS members
         FROM chat_conversations c WHERE c.id = $1`,
      [id]
    );
    return NextResponse.json({ success: true, conversation: rows[0], left: accId === String(user.accId) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to remove member" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
