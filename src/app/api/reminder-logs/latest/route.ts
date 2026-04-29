import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { getAuthUserFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getAuthUserFromCookie();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const pool = getDbPool();

    if (user.isAdmin) {
      const result = await pool.query(`
        SELECT
          l.id,
          l.created_at,
          l.sent_at,
          l.scheduled_for,
          l.channel,
          l.target_type,
          l.reminder_type,
          l.template_key,
          l.message_subject,
          l.message_body,
          l.is_simulated,
          r.role_name,
          u.unit_code,
          u.unit_name
        FROM chat_reminder_logs l
        LEFT JOIN master_roles r ON r.id = l.target_role_id
        LEFT JOIN master_units u ON u.id = l.target_unit_id
        ORDER BY COALESCE(l.sent_at, l.created_at) DESC, l.id DESC
        LIMIT 1
      `);

      return NextResponse.json({ success: true, data: result.rows[0] || null, access: 'admin' });
    }

    return NextResponse.json({ success: true, data: null, access: 'restricted' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch reminder log.' }, { status: 500 });
  }
}
