import { NextResponse } from 'next/server';
import { getProjectGanttProjects } from '@/lib/project-gantt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await getProjectGanttProjects();
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
