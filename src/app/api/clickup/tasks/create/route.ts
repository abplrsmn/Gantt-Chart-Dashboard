import { NextResponse } from 'next/server';
import { createTaskInTeam } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { teamName, taskName, description, dueDate, assignee } = body || {};

    if (!teamName || !taskName) {
      return NextResponse.json(
        { success: false, error: 'teamName and taskName are required' },
        { status: 400 }
      );
    }

    const result = await createTaskInTeam({
      teamName,
      taskName,
      description,
      dueDate,
      assigneeNameOrEmail: assignee,
    });

    return NextResponse.json({
      success: true,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
      },
      target: result.target,
      assigneeId: result.assigneeId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create task in ClickUp' },
      { status: 500 }
    );
  }
}
