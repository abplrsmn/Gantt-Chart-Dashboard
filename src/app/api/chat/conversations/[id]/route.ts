import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { isMember, MEMBERS_JSON } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/chat/conversations/[id]  { name } — renames a group. Any member may rename. */
export async function PATCH(request: Request, { params }: Ctx) {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid conversation id" }, { status: 400 });
  }

  let payload: { name?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) return NextResponse.json({ success: false, error: "Group name is required" }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ success: false, error: "Group name too long" }, { status: 400 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (!(await isMember(client, id, user.accId))) {
      return NextResponse.json({ success: false, error: "Not a member of this conversation" }, { status: 403 });
    }
    const found = await client.query(`SELECT kind FROM chat_conversations WHERE id = $1`, [id]);
    if (!found.rows[0]) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });
    if (found.rows[0].kind !== "group") {
      return NextResponse.json({ success: false, error: "Only groups can be renamed" }, { status: 400 });
    }

    await client.query(`UPDATE chat_conversations SET name = $2 WHERE id = $1`, [id, name]);

    const { rows } = await client.query(
      `SELECT c.id, c.kind, c.name, c.created_at, ${MEMBERS_JSON} AS members
         FROM chat_conversations c WHERE c.id = $1`,
      [id]
    );
    return NextResponse.json({ success: true, conversation: rows[0] });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to rename group" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
