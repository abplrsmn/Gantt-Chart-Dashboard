import { NextRequest, NextResponse } from 'next/server';
import { sendProjectSummaryToGroupChat, type SummarySendMode } from '@/lib/project-summary-send';

function resolveMode(input: string | null): SummarySendMode {
  if (input === 'overdue-reminder' || input === 'near-deadline-reminder') {
    return input;
  }
  return 'daily-summary';
}

export async function POST(request: NextRequest) {
  try {
    const mode = resolveMode(request.nextUrl.searchParams.get('mode'));
    const success = await sendProjectSummaryToGroupChat(mode);
    return NextResponse.json({ ok: success, mode });
  } catch (error) {
    console.error('Failed to execute summary send endpoint:', error);
    return NextResponse.json({ ok: false, error: 'Failed to send summary' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const mode = resolveMode(request.nextUrl.searchParams.get('mode'));
  return NextResponse.json({
    ok: true,
    mode,
    message: 'Use POST to trigger the summary send flow.',
  });
}
