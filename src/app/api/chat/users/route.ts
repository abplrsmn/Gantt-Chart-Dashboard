import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/chat/users — active accounts available to DM or add to a group. */
export async function GET() {
  const user = await getAuthUserFromCookie();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT a.id AS acc_id,
              COALESCE(p.full_name, a.email) AS name,
              p.department,
              p.job_title,
              a.email
         FROM master_acc a
         LEFT JOIN master_people p ON p.id = a.person_id
        WHERE a.is_active = true
        ORDER BY COALESCE(p.full_name, a.email) ASC`
    );

    return NextResponse.json({
      success: true,
      me: { accId: user.accId, name: user.fullName ?? user.email },
      users: rows.map((r) => ({ ...r, isMe: String(r.acc_id) === String(user.accId) })),
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load users" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
