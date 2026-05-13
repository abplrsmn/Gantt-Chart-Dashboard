import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CLICKUP_API_BASE_URL, fetchClickUp, resolveAnyTargetListByName } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

const FILE_PATH = '/home/ahgadmin/.openclaw/media/inbound/milestones---79aa91e7-00af-4eba-80f7-55de462d6a58.txt';
const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';

const phaseMap = {
  operational_brief: 'Operational Brief',
  design: 'Design',
  project_control: 'Project Control',
  project_management: 'Project Management Team',
  handover: 'Handover',
} as const;

function normalize(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

function fmt(v: unknown) {
  if (v == null || String(v).trim() === '') return '-';
  return String(v).trim();
}

function phaseDescription(project: any, phaseKey: keyof typeof phaseMap) {
  const p = project.phases?.[phaseKey] || {};
  const lines = [
    `Unit: ${fmt(project.unit)}`,
    `Project Name: ${fmt(project.projectName)}`,
  ];

  if (phaseKey === 'operational_brief') {
    lines.push(`Brief: ${fmt(p.brief)}`);
    lines.push(`Received Date: ${fmt(p.received_date)}`);
    lines.push(`Budget/CAPEX: ${fmt(p.budget_capex)}`);
  } else if (phaseKey === 'design') {
    lines.push(`Start Design Date: ${fmt(p.start_design_date)}`);
    lines.push(`Design Approval (+1 month): ${fmt(p.design_approval)}`);
    lines.push(`Duration : delay(-) / +: ${fmt(p.duration_delay)}`);
    lines.push(`Brief: ${fmt(p.brief)}`);
    lines.push(`Working Drawing (+3 weeks): ${fmt(p.working_drawing)}`);
  } else if (phaseKey === 'project_control') {
    lines.push(`Tender Start: ${fmt(p.tender_start)}`);
    lines.push(`APS = SPK Released (+3 weeks): ${fmt(p.spk_released)}`);
    lines.push(`Duration : delay(-) / +: ${fmt(p.duration_delay)}`);
    lines.push(`Contract Amount: ${fmt(p.contract_amount)}`);
  } else if (phaseKey === 'project_management') {
    lines.push(`Commence Date: ${fmt(p.commence_date)}`);
    lines.push(`End Contract: ${fmt(p.end_contract)}`);
    lines.push(`Actual Completion: ${fmt(p.actual_completion)}`);
    lines.push(`deviation : delay(-) / +: ${fmt(p.deviation)}`);
    lines.push(`Current Site Progress: ${fmt(p.current_site_progress)}`);
  } else if (phaseKey === 'handover') {
    lines.push(`BAST-1: ${fmt(p.bast_1)}`);
    lines.push(`BAST-2: ${fmt(p.bast_2)}`);
  }

  return lines.join('\n');
}

export async function POST() {
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8');
    const projects = JSON.parse(raw);
    const target = await resolveAnyTargetListByName({ listName: TARGET_LIST_NAME, spaceName: TARGET_SPACE_NAME, candidates: [TARGET_LIST_NAME] });
    const data = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task?include_closed=true&subtasks=true`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

    const results: any[] = [];

    for (const [phaseKey, parentName] of Object.entries(phaseMap)) {
      let parent = tasks.find((t: any) => normalize(t?.name) === normalize(parentName) && !t?.parent);
      if (!parent) {
        parent = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task`, {
          method: 'POST',
          body: JSON.stringify({ name: parentName, description: `${parentName} phase parent for pilot SPH sync`, notify_all: false }),
        });
        results.push({ phase: parentName, action: 'parent_created', id: parent?.id });
      }

      const parentDetail = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${parent.id}`);
      const subtasks = Array.isArray(parentDetail?.subtasks) ? parentDetail.subtasks : [];

      for (const project of projects) {
        const subtaskName = `${project.unit} - ${project.projectName}`;
        const description = phaseDescription(project, phaseKey as keyof typeof phaseMap);
        const found = subtasks.find((s: any) => normalize(s?.name) === normalize(subtaskName));

        if (found) {
          const updated = await fetchClickUp(`${CLICKUP_API_BASE_URL}/task/${found.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: subtaskName, description }),
          });
          results.push({ phase: parentName, project: subtaskName, action: 'updated', id: updated?.id || found.id });
        } else {
          const created = await fetchClickUp(`${CLICKUP_API_BASE_URL}/list/${target.listId}/task`, {
            method: 'POST',
            body: JSON.stringify({ name: subtaskName, description, parent: String(parent.id), notify_all: false }),
          });
          results.push({ phase: parentName, project: subtaskName, action: 'created', id: created?.id });
        }
      }
    }

    return NextResponse.json({ success: true, total: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed SPH phase sync' }, { status: 500 });
  }
}
