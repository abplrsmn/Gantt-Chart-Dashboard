import { NextResponse } from 'next/server';
import { addDays, differenceInCalendarDays, isValid, parse, startOfDay } from 'date-fns';
import { getCapexProjects } from '@/lib/capex';
import { sendOpenClawMessage } from '@/lib/openclaw';

export const dynamic = 'force-dynamic';

type ReminderRequest = {
  daysAhead?: number;
  groupId?: string;
  includeAtRisk?: boolean;
  dryRun?: boolean;
};

const DEFAULT_DAYS_AHEAD = 7;

function parseFlexibleDate(value?: string) {
  if (!value) return null;
  const formats = ['d MMM yyyy', 'd MMMM yyyy', 'd-MMM-yyyy', 'd-MMMM-yyyy'];

  for (const fmt of formats) {
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }

  return null;
}

function classifyHealth(status: string, hasEndDate: boolean) {
  const s = status.toLowerCase();
  if (s.includes('pending')) return 'Needs Closure';
  if (s.includes('done')) return 'Done';
  if (s.includes('on schedule')) return 'On Track';
  if (s.includes('commenced')) return 'Watch';
  if (s.includes('ongoing') && !hasEndDate) return 'At Risk';
  return 'Monitor';
}

function formatReminderMessage(input: {
  total: number;
  daysAhead: number;
  dueSoon: Array<{ name: string; unit: string; endLabel: string; daysLeft: number }>;
  atRisk: Array<{ name: string; unit: string; status: string }>;
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
      lines.push(`- ${item.unit} | ${item.name} | ${item.status}`);
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

    const projects = await getCapexProjects();
    const today = startOfDay(new Date());
    const limit = addDays(today, daysAhead);

    const dueSoon = projects
      .map((project) => {
        const endDate = parseFlexibleDate(project.end);
        if (!endDate) return null;

        const daysLeft = differenceInCalendarDays(startOfDay(endDate), today);
        if (daysLeft < 0 || daysLeft > daysAhead) return null;

        const health = classifyHealth(project.status, Boolean(project.end));
        if (health === 'Done') return null;

        return {
          name: project.name,
          unit: project.unit,
          endLabel: project.end || 'TBD',
          daysLeft,
        };
      })
      .filter((item): item is { name: string; unit: string; endLabel: string; daysLeft: number } => Boolean(item))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const atRisk = includeAtRisk
      ? projects
          .map((project) => {
            const health = classifyHealth(project.status, Boolean(project.end));
            if (!['At Risk', 'Needs Closure', 'Watch'].includes(health)) return null;
            return {
              name: project.name,
              unit: project.unit,
              status: project.status,
            };
          })
          .filter((item): item is { name: string; unit: string; status: string } => Boolean(item))
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
        meta: {
          total: projects.length,
          dueSoon: dueSoon.length,
          atRisk: atRisk.length,
          daysAhead,
          window: {
            start: today.toISOString(),
            end: limit.toISOString(),
          },
        },
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
      meta: {
        total: projects.length,
        dueSoon: dueSoon.length,
        atRisk: atRisk.length,
        daysAhead,
      },
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
