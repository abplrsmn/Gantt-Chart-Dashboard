import { NextResponse } from 'next/server';
import { getOrganizationStructure } from '@/lib/clickup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const structure = await getOrganizationStructure();
    return NextResponse.json({ success: true, data: structure });
  } catch (error: any) {
    console.error('API Error in structure route:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
