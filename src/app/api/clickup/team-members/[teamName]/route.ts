import { NextResponse } from 'next/server';
import { getTeamMembers } from '@/lib/clickup';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamName: string }> }
) {
  try {
    // Di Next.js 15, params adalah Promise dan harus di-await
    const resolvedParams = await params;
    const teamName = resolvedParams.teamName;

    if (!teamName) {
      return NextResponse.json({ success: false, error: 'Team name is required' }, { status: 400 });
    }

    const members = await getTeamMembers(teamName);
    return NextResponse.json({ success: true, data: members });
  } catch (error: any) {
    console.error('API Error in team-members route:', error);
    const message = error?.message || 'Unknown error';
    const status =
      message.includes('Missing CLICKUP_API_TOKEN or CLICKUP_TEAM_ID')
        ? 500
        : message.includes('ClickUp API Error 401') || message.includes('OAUTH_025')
          ? 401
          : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
