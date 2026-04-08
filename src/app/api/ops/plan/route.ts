import { NextResponse } from 'next/server';
import { parseOpsIntent } from '@/lib/ops-intent';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'text is required' },
        { status: 400 }
      );
    }

    const plan = parseOpsIntent(text);
    return NextResponse.json({ success: true, plan });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to plan ops intent' },
      { status: 500 }
    );
  }
}
