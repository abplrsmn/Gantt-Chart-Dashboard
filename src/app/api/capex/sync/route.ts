import { NextResponse } from 'next/server';
import { syncCapexSeedToClickUp } from '@/lib/capex-sync';
import { syncCapexSummaryToClickUp } from '@/lib/capex-summary-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const seed = await syncCapexSeedToClickUp();
    const summary = await syncCapexSummaryToClickUp();
    return NextResponse.json({ success: true, seed, summary });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to sync CAPEX' }, { status: 500 });
  }
}
