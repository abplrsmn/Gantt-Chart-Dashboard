import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const SPH_SUBTASK_NAMES = new Set(['sph sph tennis court indoor', 'sph sph tennis court 3']);

function normalizeProjectName(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/^[a-z]{2,5}\s*-\s*/i, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

export async function POST() {
  try {
    const target = await resolveAnyTargetListByName({ listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME, candidates: [TARGET_LIST_NAME] });
    const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

    const deleted: Array<{ id: string; name: string; status: string }> = [];

    for (const task of tasks) {
      const parentId = String(task?.id || '');
      const detail = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${parentId}`);
      const subtasks = Array.isArray(detail?.subtasks) ? detail.subtasks : [];
      for (const sub of subtasks) {
        const normalized = normalizeProjectName(sub?.name);
        if (!SPH_SUBTASK_NAMES.has(normalized)) continue;
        try {
          await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${sub.id}`, { method: 'DELETE' });
          deleted.push({ id: String(sub.id), name: String(sub.name || ''), status: 'deleted' });
        } catch (error: any) {
          deleted.push({ id: String(sub.id), name: String(sub.name || ''), status: error?.message || 'failed' });
        }
      }
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed SPH hard reset' }, { status: 500 });
  }
}
