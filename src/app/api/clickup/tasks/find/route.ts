import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveTargetList } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

function normalize(value?: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taskId = String(body?.taskId || '').trim();
    const query = String(body?.query || body?.name || '').trim();

    if (taskId) {
      const task = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${taskId}`);
      return NextResponse.json({
        success: true,
        mode: 'taskId',
        matches: [
          {
            id: task?.id,
            name: task?.name,
            url: task?.url,
            status: task?.status,
            due_date: task?.due_date,
            start_date: task?.start_date,
          },
        ],
      });
    }

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'taskId or query is required' },
        { status: 400 }
      );
    }

    const target = await resolveTargetList({
      teamName: body?.team,
      folderName: body?.folder,
      listName: body?.list,
      spaceName: body?.space,
    });

    const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const needle = normalize(query);

    const matches = tasks
      .map((task: any) => {
        const name = normalize(task?.name);
        let score = 0;
        if (name === needle) score += 100;
        if (name.includes(needle)) score += 60;
        if (needle.includes(name) && name) score += 40;
        return {
          id: task?.id,
          name: task?.name,
          url: task?.url,
          status: task?.status,
          due_date: task?.due_date,
          start_date: task?.start_date,
          score,
        };
      })
      .filter((task: any) => task.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      mode: 'query',
      target,
      matches,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to find task in ClickUp' },
      { status: 500 }
    );
  }
}
