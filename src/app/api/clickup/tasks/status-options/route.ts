import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taskId = String(body?.taskId || '').trim();
    const listId = String(body?.listId || '').trim();

    if (!taskId && !listId) {
      return NextResponse.json(
        { success: false, error: 'taskId or listId is required' },
        { status: 400 }
      );
    }

    let effectiveListId = listId;
    let task: any = null;

    if (taskId) {
      task = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${taskId}`);
      effectiveListId = String(task?.list?.id || effectiveListId || '').trim();
    }

    if (!effectiveListId) {
      return NextResponse.json(
        { success: false, error: 'Unable to resolve listId for status lookup' },
        { status: 400 }
      );
    }

    const list = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${effectiveListId}`);
    const statuses = Array.isArray(list?.statuses) ? list.statuses : [];

    return NextResponse.json({
      success: true,
      list: {
        id: list?.id,
        name: list?.name,
      },
      task: taskId
        ? {
            id: task?.id,
            name: task?.name,
            status: task?.status,
          }
        : null,
      statuses: statuses.map((status: any) => ({
        id: status?.id,
        status: status?.status,
        type: status?.type,
        color: status?.color,
        orderindex: status?.orderindex,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch status options from ClickUp' },
      { status: 500 }
    );
  }
}
