import { NextResponse } from 'next/server';
import { renameTask } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, name } = body || {};

    if (!taskId || !name) {
      return NextResponse.json(
        { success: false, error: 'taskId and name are required' },
        { status: 400 }
      );
    }

    const result = await renameTask(String(taskId), String(name));

    return NextResponse.json({
      success: true,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
        status: result.task?.status,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to rename task in ClickUp' },
      { status: 500 }
    );
  }
}
