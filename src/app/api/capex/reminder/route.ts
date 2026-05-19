import { NextResponse } from 'next/server';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { getProjectGanttProjects } from '@/lib/project-gantt';
import { sendOpenClawMessage } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

type ReminderRequest = {
  daysAhead?: number;
  groupId?: string;
  includeAtRisk?: boolean;
  dryRun?: boolean;
};

const DEFAULT_DAYS_AHEAD = 7;

function formatReminderMessage(input: {
  total: number;
  daysAhead: number;
  dueSoon: Array<{ name: string; unit: string; endLabel: string; daysLeft: number }>;
  atRisk: Array<{ name: string; unit: string; risk: string }>;
}) {
  const lines: string[] = [];

  lines.push('CAPEX Reminder');
  lines.push(`Total project monitored: ${input.total}`);
  lines.push(`Due in <= ${input.daysAhead} days: ${input.dueSoon.length}`);

  if (input.dueSoon.length > 0) {
    lines.push('');
    lines.push('Due Soon');
    for (const item of input.dueSoon) {
      lines.push(`- ${item.unit} | ${item.name} | due ${item.endLabel} (${item.daysLeft}d)`);
    }
  }

  if (input.atRisk.length > 0) {
    lines.push('');
    lines.push('Need Attention');
    for (const item of input.atRisk) {
      lines.push(`- ${item.unit} | ${item.name} | ${item.risk}`);
    }
  }

  lines.push('');
  lines.push('Please update progress and next action this week.');

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ReminderRequest;

    const daysAhead = Number.isFinite(Number(body.daysAhead))
      ? Math.max(1, Math.min(30, Number(body.daysAhead)))
      : DEFAULT_DAYS_AHEAD;

    const includeAtRisk = body.includeAtRisk !== false;
    const dryRun = Boolean(body.dryRun);

    const projects = await getProjectGanttProjects();
    const today = startOfDay(new Date());

    const dueSoon = projects
      .map((project) => {
        if (!project.end || project.phase === 'done' || project.phase === 'blocked') return null;
        const endDate = new Date(project.end);
        if (Number.isNaN(endDate.getTime())) return null;
        const daysLeft = differenceInCalendarDays(startOfDay(endDate), today);
        if (daysLeft < 0 || daysLeft > daysAhead) return null;
        return {
          name: project.name,
          unit: project.unit,
          endLabel: project.end,
          daysLeft,
        };
      })
      .filter((item): item is { name: string; unit: string; endLabel: string; daysLeft: number } => Boolean(item))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const atRisk = includeAtRisk
      ? projects
          .map((project) => {
            if (project.deadlineRisk !== 'overdue' && project.deadlineRisk !== 'near') return null;
            if (project.phase === 'done') return null;
            return {
              name: project.name,
              unit: project.unit,
              risk: project.deadlineRisk === 'overdue' ? 'Overdue' : 'Near Deadline',
            };
          })
          .filter((item): item is { name: string; unit: string; risk: string } => Boolean(item))
      : [];

    const message = formatReminderMessage({
      total: projects.length,
      daysAhead,
      dueSoon,
      atRisk,
    });

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        meta: { total: projects.length, dueSoon: dueSoon.length, atRisk: atRisk.length, daysAhead },
        message,
      });
    }

    const response = await sendOpenClawMessage({
      groupId: body.groupId,
      message,
    });

    return NextResponse.json({
      success: true,
      dryRun: false,
      sent: true,
      meta: { total: projects.length, dueSoon: dueSoon.length, atRisk: atRisk.length, daysAhead },
      response,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send CAPEX reminder',
      },
      { status: 500 }
    );
  }
}
