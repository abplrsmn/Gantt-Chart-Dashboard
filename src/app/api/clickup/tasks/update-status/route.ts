import { NextResponse } from 'next/server';
import { updateTaskStatus } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, status } = body || {};

    if (!taskId || !status) {
      return NextResponse.json(
        { success: false, error: 'taskId and status are required' },
        { status: 400 }
      );
    }

    const result = await updateTaskStatus(String(taskId), String(status));

    return NextResponse.json({
      success: true,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
        status: result.task?.status,
        date_done: result.task?.date_done,
        date_closed: result.task?.date_closed,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update task status in ClickUp' },
      { status: 500 }
    );
  }
}
