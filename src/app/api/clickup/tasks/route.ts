import { NextResponse } from 'next/server';
import { getTasks, getIDEASpaceEmployeeCount } from '@/lib/clickup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tasks = await getTasks();
    const ideaEmployeeCount = await getIDEASpaceEmployeeCount();
    
    return NextResponse.json({ 
      success: true, 
      data: tasks,
      totalEmployees: ideaEmployeeCount 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
