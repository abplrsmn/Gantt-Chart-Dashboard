import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const duplicateIds = [
      '86exb0216','86exb020q','86exb020a','86exb03rn','86exb03u2','86exb03v8',
      '86exb021h','86exb020v','86exb020f','86exb03rw','86exb03uj','86exb03vg'
    ];

    const results = [] as Array<{id:string,status:string}>;
    for (const id of duplicateIds) {
      try {
        await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${id}`, { method: 'DELETE' });
        results.push({ id, status: 'deleted' });
      } catch (error: any) {
        results.push({ id, status: error?.message || 'failed' });
      }
    }

    return NextResponse.json({ success: true, total: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to cleanup SPH duplicates' }, { status: 500 });
  }
}
