import { NextResponse } from 'next/server';
import { parseOpsIntent, parseStructuredOpsCommand } from '@/lib/ops-intent';
import { createTaskInCapexProjectList, createTaskInTarget } from '@/lib/clickup-write';
import { resolveTaskRouting } from '@/lib/task-routing';

export const dynamic = 'force-dynamic';

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function getInboundText(body: any) {
  return firstNonEmptyString(
    body?.text,
    body?.message,
    body?.caption,
    body?.content?.text,
    body?.payload?.text,
    body?.payload?.message,
    body?.context?.text
  );
}

function getInboundGroupName(body: any) {
  return (
    firstNonEmptyString(
      body?.groupName,
      body?.chatTitle,
      body?.group,
      body?.context?.groupName,
      body?.context?.chatTitle,
      body?.conversationName
    ) || null
  );
}

function getInboundSelectors(body: any) {
  return {
    teamName: firstNonEmptyString(body?.team, body?.target?.team, body?.context?.teamName) || undefined,
    folderName: firstNonEmptyString(body?.folder, body?.target?.folder, body?.context?.folderName) || undefined,
    listName: firstNonEmptyString(body?.list, body?.target?.list, body?.context?.listName) || undefined,
    spaceName: firstNonEmptyString(body?.space, body?.target?.space, body?.context?.spaceName) || undefined,
  };
}

function normalizeGroupTeam(groupName?: string | null) {
  const lowered = String(groupName || '').toLowerCase();
  if (lowered.includes('tech')) return 'tech';
  if (lowered.includes('data') || lowered.includes('digital')) return 'data & digital';
  return null;
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
    const text = getInboundText(body);
    const groupName = getInboundGroupName(body);
    const payloadSelectors = getInboundSelectors(body);

    if (!text) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    const structured = parseStructuredOpsCommand(text);
    const projectFields = structured?.commandType === 'PROJECT' ? structured.fields : null;
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

      const routing = resolveTaskRouting({
        text,
        groupName,
        isProjectCommand: true,
        hasProjectUnit: !!unit,
        explicitSelectors: {
          listName: projectFields.list || payloadSelectors.listName,
          folderName: projectFields.folder || payloadSelectors.folderName,
          spaceName: projectFields.space || payloadSelectors.spaceName,
          teamName: projectFields.team || payloadSelectors.teamName,
        },
      });

      const result = routing.useCapexDefault
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
            teamName: projectFields.team || payloadSelectors.teamName || routing.selectors?.teamName,
            folderName: projectFields.folder || payloadSelectors.folderName || routing.selectors?.folderName,
            listName: projectFields.list || payloadSelectors.listName || routing.selectors?.listName,
            spaceName: projectFields.space || payloadSelectors.spaceName || routing.selectors?.spaceName,
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
    if (!fields.team && payloadSelectors.teamName) {
      fields.team = payloadSelectors.teamName;
    }
    if (!fields.folder && payloadSelectors.folderName) {
      fields.folder = payloadSelectors.folderName;
    }
    if (!fields.list && payloadSelectors.listName) {
      fields.list = payloadSelectors.listName;
    }
    if (!fields.space && payloadSelectors.spaceName) {
      fields.space = payloadSelectors.spaceName;
    }
    if (!fields.taskTitle) {
      const fallbackTitle = firstNonEmptyString(body?.title, body?.taskTitle, body?.task, body?.name);
      fields.taskTitle = /^\s*(TASK|PROJECT)\s*\|?\s*$/i.test(fallbackTitle) ? '' : fallbackTitle;
    }
    if (!fields.description) {
      fields.description = firstNonEmptyString(body?.description, body?.desc, body?.note, body?.notes) || undefined;
    }
    if (!fields.assignee) {
      fields.assignee = firstNonEmptyString(body?.assignee, body?.assign, body?.pic) || null;
    }
    if (!fields.dueDateHint) {
      fields.dueDateHint = firstNonEmptyString(body?.due, body?.deadline, body?.end) || null;
    }

    if (!fields.team) {
      fields.team = groupTeam || 'tech';
    }

    if (!plan.shouldExecute && !fields.taskTitle) {
      return NextResponse.json({ success: true, plan: { ...plan, fields }, executed: false });
    }

    const routing = resolveTaskRouting({
      text,
      groupName,
      intentTeam: fields.team,
      isProjectCommand: false,
      explicitSelectors: {
        listName: fields.list || payloadSelectors.listName,
        folderName: fields.folder || payloadSelectors.folderName,
        spaceName: fields.space || payloadSelectors.spaceName,
        teamName: fields.team || payloadSelectors.teamName,
      },
    });

    const result = routing.useCapexDefault
      ? await createTaskInCapexProjectList({
          taskName: fields.taskTitle,
          dueDate: fields.dueDateHint || undefined,
          assigneeNameOrEmail: fields.assignee || undefined,
          description: fields.description || text,
        })
      : await createTaskInTarget({
          taskName: fields.taskTitle,
          dueDate: fields.dueDateHint || undefined,
          assigneeNameOrEmail: fields.assignee || undefined,
          description: fields.description || text,
          teamName: fields.team || routing.selectors?.teamName,
          folderName: fields.folder || routing.selectors?.folderName,
          listName: fields.list || routing.selectors?.listName,
          spaceName: fields.space || routing.selectors?.spaceName,
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
