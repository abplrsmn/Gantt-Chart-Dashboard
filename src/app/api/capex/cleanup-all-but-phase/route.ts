import { NextResponse } from 'next/server';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const KEEP_PARENT_NAMES = new Set([
  'operational brief',
  'design',
  'project control',
  'project management team',
  'handover',
]);

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
    const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

    const parentCandidates = tasks.filter((task) => !task?.parent && KEEP_PARENT_NAMES.has(normalize(task?.name)));
    const newestParentByName = new Map<string, any>();
    for (const task of parentCandidates) {
      const key = normalize(task?.name);
      const existing = newestParentByName.get(key);
      if (!existing || Number(task?.date_created || 0) > Number(existing?.date_created || 0)) {
        newestParentByName.set(key, task);
      }
    }

    const keepIds = new Set<string>();
    for (const task of newestParentByName.values()) {
      keepIds.add(String(task.id));
      const detail = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${task.id}`);
      const subtasks = Array.isArray(detail?.subtasks) ? detail.subtasks : [];
      for (const sub of subtasks) keepIds.add(String(sub.id));
    }

    const results: Array<{ id: string; name: string; status: string }> = [];
    for (const task of tasks) {
      const id = String(task?.id || '');
      const name = String(task?.name || '');
      if (keepIds.has(id)) {
        results.push({ id, name, status: 'kept' });
        continue;
      }
      try {
        await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${id}`, { method: 'DELETE' });
        results.push({ id, name, status: 'deleted' });
      } catch (error: any) {
        results.push({ id, name, status: error?.message || 'failed' });
      }
    }

    return NextResponse.json({
      success: true,
      target,
      kept: results.filter((r) => r.status === 'kept'),
      deleted: results.filter((r) => r.status === 'deleted'),
      failed: results.filter((r) => r.status !== 'kept' && r.status !== 'deleted'),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed cleanup all but phase' }, { status: 500 });
  }
}
