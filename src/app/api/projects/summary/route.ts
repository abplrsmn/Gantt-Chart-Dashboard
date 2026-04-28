import { NextResponse } from 'next/server';
import { getDailyProjectSummary } from '@/lib/project-summary';

export async function GET() {
  try {
    const summary = await getDailyProjectSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to get daily project summary:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
