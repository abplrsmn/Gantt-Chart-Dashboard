import { NextResponse } from 'next/server';
import { getCapexProjects } from '@/lib/capex';

export async function GET() {
  try {
    const projects = await getCapexProjects();
    return NextResponse.json({ success: true, data: projects });
  } catch (error: any) {
    console.error('API Error in capex projects route:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch CAPEX projects',
      },
      { status: 500 }
    );
  }
}
