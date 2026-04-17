import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taskId = String(body?.taskId || '').trim();

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 }
      );
    }

    const task = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${taskId}`);

    return NextResponse.json({
      success: true,
      task: {
        id: task?.id,
        name: task?.name,
        url: task?.url,
        description: task?.description,
        status: task?.status,
        due_date: task?.due_date,
        start_date: task?.start_date,
        date_created: task?.date_created,
        date_updated: task?.date_updated,
        list: task?.list,
        folder: task?.folder,
        space: task?.space,
        assignees: task?.assignees,
        custom_fields: task?.custom_fields,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get task detail from ClickUp' },
      { status: 500 }
    );
  }
}
