import { NextResponse } from 'next/server';
import { syncCapexSeedToClickUp } from '@/lib/capex-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await syncCapexSeedToClickUp();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to sync CAPEX' }, { status: 500 });
  }
}
