import { NextResponse } from 'next/server';
import { parseOpsIntent } from '@/lib/ops-intent';
import { createTaskInCapexProjectList, createTaskInTarget, createTaskInTeam } from '@/lib/clickup-write';
import { resolveTaskRouting } from '@/lib/task-routing';

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
    const groupName = body?.groupName || body?.chatTitle || body?.group || null;

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

      const hasExplicitTarget =
        !!(projectFields.list || projectFields.folder || projectFields.team || projectFields.space);

      const routing = hasExplicitTarget
        ? {
            source: 'explicit-target',
            confidence: 1,
            reason: 'PROJECT command provided explicit target selector',
            ruleId: null,
          }
        : resolveTaskRouting({
            text,
            groupName,
            isProjectCommand: true,
          });

      const result = hasExplicitTarget
        ? await createTaskInTarget({
            taskName,
            description: buildProjectDescription(projectFields, text),
            dueDate: projectFields.end || projectFields.due,
            startDate: projectFields.start,
            assigneeNameOrEmail: projectFields.pic,
            listName: projectFields.list,
            folderName: projectFields.folder,
            teamName: projectFields.team,
            spaceName: projectFields.space,
          })
        : routing.useCapexDefault
        ? await createTaskInCapexProjectList({
            taskName,
            description: buildProjectDescription(projectFields, text),
            dueDate: projectFields.end || projectFields.due,
            startDate: projectFields.start,
            assigneeNameOrEmail: projectFields.pic,
          })
        : await createTaskInTarget({
            taskName,
            description: buildProjectDescription(projectFields, text),
            dueDate: projectFields.end || projectFields.due,
            startDate: projectFields.start,
            assigneeNameOrEmail: projectFields.pic,
            teamName: routing.selectors?.teamName,
            folderName: routing.selectors?.folderName,
            listName: routing.selectors?.listName,
            spaceName: routing.selectors?.spaceName,
          });

      return NextResponse.json({
        success: true,
        executed: true,
        mode: 'project-command',
        routing,
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
    const groupTeam = normalizeGroupTeam(groupName);
    if (!fields.team) {
      fields.team = groupTeam || 'tech';
    }

    if (!plan.shouldExecute && !fields.taskTitle) {
      return NextResponse.json({ success: true, plan: { ...plan, fields }, executed: false });
    }

    const hasExplicitTarget = !!(fields.list || fields.folder || fields.space);
    const routing = hasExplicitTarget
      ? {
          source: 'explicit-target',
          confidence: 1,
          reason: 'Task command provided explicit target selector',
          ruleId: null,
        }
      : resolveTaskRouting({
          text,
          groupName,
          intentTeam: fields.team,
          isProjectCommand: false,
        });

    const result = hasExplicitTarget
      ? await createTaskInTarget({
          taskName: fields.taskTitle,
          dueDate: fields.dueDateHint || undefined,
          assigneeNameOrEmail: fields.assignee || undefined,
          description: fields.description || text,
          teamName: fields.team || undefined,
          folderName: fields.folder || undefined,
          listName: fields.list || undefined,
          spaceName: fields.space || undefined,
        })
      : routing.useCapexDefault
      ? await createTaskInCapexProjectList({
          taskName: fields.taskTitle,
          dueDate: fields.dueDateHint || undefined,
          assigneeNameOrEmail: fields.assignee || undefined,
          description: fields.description || text,
        })
      : routing.selectors
      ? await createTaskInTarget({
          taskName: fields.taskTitle,
          dueDate: fields.dueDateHint || undefined,
          assigneeNameOrEmail: fields.assignee || undefined,
          description: fields.description || text,
          teamName: routing.selectors.teamName,
          folderName: routing.selectors.folderName,
          listName: routing.selectors.listName,
          spaceName: routing.selectors.spaceName,
        })
      : await createTaskInTeam({
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
      routing,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
      },
      target: result.target,
      assigneeId: result.assigneeId,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to execute task operation';
    const isTargetResolutionError = /target|folder|space|list|team/i.test(message) && /not found|unable to resolve|no target selector/i.test(message);
    return NextResponse.json(
      { success: false, error: message },
      { status: isTargetResolutionError ? 400 : 500 }
    );
  }
}
