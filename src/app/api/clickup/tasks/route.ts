import { NextResponse } from 'next/server';
import { getTasks, getIDEASpaceEmployeeCount, getOrganizationStructure } from '@/lib/clickup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [tasks, ideaEmployeeCount, structure] = await Promise.all([
      getTasks(),
      getIDEASpaceEmployeeCount(),
      getOrganizationStructure(),
    ]);
    
    return NextResponse.json({ 
      success: true, 
      data: tasks,
      totalEmployees: ideaEmployeeCount,
      totalDepartments: structure.totalDepartments,
      totalTeams: structure.totalTeams,
      departments: structure.departments,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
