import { NextResponse } from 'next/server';

const API_TOKEN = process.env.CLICKUP_API_TOKEN;
const TEAM_ID = process.env.CLICKUP_TEAM_ID;

const DEPARTMENTS = [
  { name: 'IDEA',      spaceId: '901810204419' },
  { name: 'Marketing', spaceId: '901810204420' },
  { name: 'Finance',   spaceId: '901810204444' },
  { name: 'HR',        spaceId: '901810204446' },
];

async function fetchClickUp(path: string) {
  const token = (API_TOKEN || '').replace(/['"]/g, '').trim();
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: token },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ClickUp API error: ${res.status}`);
  return res.json();
}

async function getTasksForSpace(spaceId: string) {
  const teamId = (TEAM_ID || '').replace(/['"]/g, '').trim();
  const recentWindowDays = 30;
  const recentWindowMs = recentWindowDays * 24 * 60 * 60 * 1000;
  let total = 0;
  let completed = 0;
  let overdue = 0;
  let recentTotal = 0;
  let recentCompleted = 0;
  let recentOverdueOpen = 0;
  let onTimeCompleted = 0;
  let completedWithDueDate = 0;
  let page = 0;
  const now = Date.now();

  while (true) {
    const data = await fetchClickUp(
      `/team/${teamId}/task?space_ids[]=${spaceId}&page=${page}&include_closed=true&subtasks=true`
    );
    const tasks = data.tasks || [];
    if (tasks.length === 0) break;

    total += tasks.length;
    tasks.forEach((t: any) => {
      const statusStr = String(t.status?.status || '').toLowerCase();
      const isClosed =
        t.status?.type === 'closed' ||
        ['complete', 'completed', 'done', 'closed'].includes(statusStr);
      const createdMs = t.date_created ? parseInt(String(t.date_created), 10) : NaN;
      const closedMs = t.date_closed ? parseInt(String(t.date_closed), 10) : NaN;
      const dueDate = t.due_date ? parseInt(String(t.due_date), 10) : NaN;

      const inRecentWindow =
        (!Number.isNaN(createdMs) && now - createdMs <= recentWindowMs) ||
        (!Number.isNaN(closedMs) && now - closedMs <= recentWindowMs);

      if (inRecentWindow) {
        recentTotal += 1;
      }

      if (isClosed) {
        completed += 1;

        if (inRecentWindow) {
          recentCompleted += 1;
          if (!Number.isNaN(dueDate)) {
            completedWithDueDate += 1;
            if (!Number.isNaN(closedMs) && closedMs <= dueDate) {
              onTimeCompleted += 1;
            }
          }
        }
      } else {
        if (!Number.isNaN(dueDate) && dueDate < now) {
          overdue += 1;
          if (inRecentWindow) {
            recentOverdueOpen += 1;
          }
        }
      }
    });

    if (!data.last_page) break;
    page++;
  }

  return {
    total,
    completed,
    overdue,
    inProgress: total - completed,
    recentWindowDays,
    recentTotal,
    recentCompleted,
    recentOverdueOpen,
    recentInProgress: recentTotal - recentCompleted,
    onTimeCompleted,
    completedWithDueDate,
  };
}

export async function GET() {
  try {
    const results = await Promise.all(
      DEPARTMENTS.map(async (dept) => {
        const stats = await getTasksForSpace(dept.spaceId);
        return { department: dept.name, ...stats };
      })
    );
    return NextResponse.json({ data: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
