import { NextResponse } from 'next/server';
import { executeUnifiedOpsRoute, logUnifiedOpsError } from '@/lib/unified-ops-router';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
    const result = await executeUnifiedOpsRoute(body || {});

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to execute unified ops route';
    await logUnifiedOpsError(body || {}, message);
    return NextResponse.json(
      {
        success: false,
        routeType: 'error',
        error: message,
        telegramMessage: `❌ Sync gagal: ${message}`,
      },
      { status: 500 }
    );
  }
}
