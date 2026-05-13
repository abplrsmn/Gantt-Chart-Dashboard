import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const PHASE_PARENTS = ['Operational Brief', 'Design', 'Project Control', 'Project Management Team', 'Handover'];
const SPH_SUBTASK_NAMES = ['SPH - SPH TENNIS COURT INDOOR', 'SPH - SPH TENNIS COURT 3'];

function normalize(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

export async function POST() {
  try {
    const target = await resolveAnyTargetListByName({ listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME, candidates: [TARGET_LIST_NAME] });
    const deleted: Array<{id:string;name:string;status:string}> = [];

    for (const parentName of PHASE_PARENTS) {
      const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const parent = tasks.find((t: any) => !t?.parent && normalize(t?.name) === normalize(parentName));
      if (!parent) continue;
      const detail = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${parent.id}`);
      const subtasks = Array.isArray(detail?.subtasks) ? detail.subtasks : [];
      for (const sub of subtasks) {
        const name = String(sub?.name || '');
        if (SPH_SUBTASK_NAMES.some((n) => normalize(n) === normalize(name))) {
          try {
            await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${sub.id}`, { method: 'DELETE' });
            deleted.push({ id: String(sub.id), name, status: 'deleted' });
          } catch (error: any) {
            deleted.push({ id: String(sub.id), name, status: error?.message || 'failed' });
          }
        }
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to reset SPH phase subtasks' }, { status: 500 });
  }
}
