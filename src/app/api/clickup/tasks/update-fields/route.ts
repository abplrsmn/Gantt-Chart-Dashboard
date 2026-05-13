import { NextResponse } from 'next/server';
import { updateTaskFields } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, name, description, dueDate, startDate, assignee } = body || {};

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId is required' },
        { status: 400 }
      );
    }

    const result = await updateTaskFields({
      taskId: String(taskId),
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
      dueDate: typeof dueDate === 'string' ? dueDate : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      assigneeNameOrEmail: typeof assignee === 'string' ? assignee : undefined,
    });

    return NextResponse.json({
      success: true,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
        status: result.task?.status,
        due_date: result.task?.due_date,
        start_date: result.task?.start_date,
        description: result.task?.description,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update task fields in ClickUp' },
      { status: 500 }
    );
  }
}
