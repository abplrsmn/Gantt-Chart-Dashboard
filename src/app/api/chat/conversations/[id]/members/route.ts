import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember, MEMBERS_JSON } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/chat/conversations/[id]/members  { accId } — adds a member to a group. */
export async function POST(request: Request, { params }: Ctx) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid conversation id" }, { status: 400 });
  }

  let payload: { accId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const accId = String(payload.accId ?? "");
  if (!/^\d+$/.test(accId)) {
    return NextResponse.json({ success: false, error: "accId is required" }, { status: 400 });
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

    const target = await client.query(`SELECT id FROM master_acc WHERE id = $1 AND is_active = true`, [accId]);
    if (!target.rows[0]) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    if (await isMember(client, id, accId)) {
      return NextResponse.json({ success: false, error: "User is already a member" }, { status: 400 });
    }

    await client.query(
      `INSERT INTO chat_conversation_members (conversation_id, acc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, accId]
    );

    const { rows } = await client.query(
      `SELECT c.id, c.kind, c.name, c.created_at, ${MEMBERS_JSON} AS members
         FROM chat_conversations c WHERE c.id = $1`,
      [id]
    );
    return NextResponse.json({ success: true, conversation: rows[0] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to add member" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
