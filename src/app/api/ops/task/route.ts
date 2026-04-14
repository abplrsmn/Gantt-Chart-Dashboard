import { NextResponse } from 'next/server';
import { parseOpsIntent } from '@/lib/ops-intent';
import { createTaskInCapexProjectList, createTaskInTeam } from '@/lib/clickup-write';

export const dynamic = 'force-dynamic';

function normalizeGroupTeam(groupName?: string | null) {
  const lowered = String(groupName || '').toLowerCase();
  if (lowered.includes('tech')) return 'tech';
  if (lowered.includes('data') || lowered.includes('digital')) return 'data & digital';
  return null;
}

function parseProjectPipeCommand(text: string) {
  const markerIndex = text.toUpperCase().indexOf('PROJECT |');
  if (markerIndex < 0) return null;

  const cleaned = text
    .slice(markerIndex)
    .replace(/```/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  if (!cleaned.toUpperCase().startsWith('PROJECT |')) return null;

  const pairs = cleaned.split('|').slice(1);
  const fields: Record<string, string> = {};

  for (const pair of pairs) {
    const match = pair.match(/^\s*([A-Za-z0-9 _-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
    const value = match[2].trim();
    if (!value) continue;
    fields[key] = value;
  }

  if (!fields.title && !fields.project && !fields.task) return null;
  return fields;
}

function buildProjectDescription(fields: Record<string, string>, originalText: string) {
  const rows = [
    'SOURCE: OPS_PROJECT_COMMAND',
    fields.folder ? `Folder: ${fields.folder}` : null,
    fields.unit ? `Unit: ${fields.unit}` : null,
    fields.status ? `Status: ${fields.status}` : null,
    fields.progress ? `Progress: ${fields.progress}` : null,
    fields.pic ? `PIC: ${fields.pic}` : null,
    fields.start ? `Start: ${fields.start}` : null,
    fields.end ? `End: ${fields.end}` : null,
    fields.note ? `Status Note: ${fields.note}` : null,
    fields.next_action ? `Next Action: ${fields.next_action}` : null,
    '',
    'Original Command:',
    originalText,
  ].filter(Boolean);

  return rows.join('\n');
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    const projectFields = parseProjectPipeCommand(text);
    if (projectFields) {
      const baseTitle = projectFields.title || projectFields.project || projectFields.task || '';
      const unit = (projectFields.unit || '').trim();
      const normalizedTitle = baseTitle.trim();
      const hasUnitPrefix =
        !!unit &&
        new RegExp(`^${escapeRegex(unit)}\\s*(?:-|:|\\|)`, 'i').test(normalizedTitle);
      const taskName = unit && !hasUnitPrefix ? `${unit} - ${normalizedTitle}` : normalizedTitle;

      if (!taskName.trim()) {
        return NextResponse.json({ success: false, error: 'PROJECT command is missing title' }, { status: 400 });
      }

      const result = await createTaskInCapexProjectList({
        taskName,
        description: buildProjectDescription(projectFields, text),
        dueDate: projectFields.end || projectFields.due,
        startDate: projectFields.start,
        assigneeNameOrEmail: projectFields.pic,
      });

      return NextResponse.json({
        success: true,
        executed: true,
        mode: 'project-command',
        parsed: projectFields,
        task: {
          id: result.task?.id,
          name: result.task?.name,
          url: result.task?.url,
        },
        target: result.target,
        assigneeId: result.assigneeId,
      });
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
