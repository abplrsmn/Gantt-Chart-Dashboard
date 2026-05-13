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
const KEEP_SUBTASK_IDS = new Set([
  '86exb03rd','86exb03te','86exb03uw','86exazvbp','86exazvgm',
  '86exb03vt','86exb03w2','86exb03wh','86exb03wt'
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

    const toDelete: Array<{ id: string; name: string }> = [];
    const kept: Array<{ id: string; name: string }> = [];

    for (const task of tasks) {
      const id = String(task?.id || '');
      const name = String(task?.name || '');
      const parent = task?.parent ? String(task.parent) : '';
      const normalizedName = normalize(name);

      const keep = KEEP_SUBTASK_IDS.has(id)
        || (!parent && KEEP_PARENT_NAMES.has(normalizedName));

      if (keep) kept.push({ id, name });
      else toDelete.push({ id, name });
    }

    const results = [] as Array<{ id: string; name: string; status: string }>;
    for (const item of toDelete) {
      try {
        await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${item.id}`, { method: 'DELETE' });
        results.push({ ...item, status: 'deleted' });
      } catch (error: any) {
        results.push({ ...item, status: error?.message || 'failed' });
      }
    }

    return NextResponse.json({
      success: true,
      target,
      kept,
      deleted: results,
      totalDeleted: results.filter((r) => r.status === 'deleted').length,
      totalFailed: results.filter((r) => r.status !== 'deleted').length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to cleanup non-phase tasks' }, { status: 500 });
  }
}
