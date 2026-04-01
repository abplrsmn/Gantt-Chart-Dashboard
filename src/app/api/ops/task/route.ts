import { NextResponse } from 'next/server';
import { parseOpsIntent } from '@/lib/ops-intent';
import { createTaskInTeam } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

function normalizeGroupTeam(groupName?: string | null) {
  const lowered = String(groupName || '').toLowerCase();
  if (lowered.includes('tech')) return 'tech';
  if (lowered.includes('data') || lowered.includes('digital')) return 'data & digital';
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    const plan = parseOpsIntent(text);

    if (plan.intent !== 'task') {
      return NextResponse.json({ success: false, error: 'Intent is not task', plan }, { status: 400 });
    }

    const fields = { ...(plan.fields as any) };
    const groupTeam = normalizeGroupTeam(body?.groupName || body?.chatTitle || body?.group || null);
    if (!fields.team) {
      fields.team = groupTeam || 'tech';
    }

    if (!plan.shouldExecute && !fields.taskTitle) {
      return NextResponse.json({ success: true, plan: { ...plan, fields }, executed: false });
    }

    const result = await createTaskInTeam({
      teamName: fields.team,
      taskName: fields.taskTitle,
      dueDate: fields.dueDateHint || undefined,
      assigneeNameOrEmail: fields.assignee || undefined,
      description: fields.description || text,
    });

    return NextResponse.json({
      success: true,
      executed: true,
      plan: { ...plan, fields },
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
      { success: false, error: error?.message || 'Failed to execute task operation' },
      { status: 500 }
    );
  }
}
