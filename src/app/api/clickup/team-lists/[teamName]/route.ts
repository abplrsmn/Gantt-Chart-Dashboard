import { NextResponse } from 'next/server';
import { getTeamFolderTaskLists } from '@/lib/clickup';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamName: string }> }
) {
  try {
    const resolvedParams = await params;
    const teamName = resolvedParams.teamName;

    if (!teamName) {
      return NextResponse.json({ success: false, error: 'Team name is required' }, { status: 400 });
    }

    const data = await getTeamFolderTaskLists(teamName);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('API Error in team-lists route:', error);
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
