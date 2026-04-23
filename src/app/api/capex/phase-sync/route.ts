import { NextResponse } from 'next/server';
import { syncCapexPhaseStructure } from '@/lib/capex-phase-sync';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await syncCapexPhaseStructure();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync CAPEX phase structure' },
      { status: 500 }
    );
  }
}
