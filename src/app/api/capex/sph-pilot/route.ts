import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TARGET_LIST_ID = '901817189531';
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const PHASE_BY_PARENT: Record<string, string> = {
  'operational brief': 'operational_brief',
  'design': 'design',
  'project control': 'project_control',
  'project management team': 'project_management',
  'handover': 'handover',
};

const PHASE_BY_PARENT_ID: Record<string, string> = {
  '86exb03rd': 'operational_brief',
  '86exb03te': 'design',
  '86exb03uw': 'project_control',
  '86exazvbp': 'project_management',
  '86exazvgm': 'handover',
};

function extractField(text: string, label: string): string | undefined {
  const lines = String(text || '').split(/\r?\n/);
  const lowered = label.trim().toLowerCase();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    if (key === lowered) {
      const value = trimmed.slice(idx + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

function cleanValue(value?: string | null): string | null {
  if (value == null) return null;
  let trimmed = String(value).trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null') return null;
  trimmed = trimmed.replace(/^deviation\s*:\s*/i, '');
  trimmed = trimmed.replace(/^duration\s*:\s*/i, '');
  trimmed = trimmed.replace(/^delay\(-\)\s*\/\s*\+:\s*/i, '');
  trimmed = trimmed.replace(/^delay\(-\)\s*\/\s*\+\s*:?\s*/i, '');
  trimmed = trimmed.trim();
  if (!trimmed || trimmed === '-') return null;
  return trimmed;
}

function ensureProject(store: Map<string, any>, unit: string, projectName: string) {
  const key = `${unit.toUpperCase()}::${projectName.trim().toLowerCase()}`;
  if (!store.has(key)) {
    store.set(key, {
      unit: unit.toUpperCase(),
      projectName: projectName.trim(),
      phases: {},
    });
  }
  return store.get(key);
}

function mergePhaseData(target: any, phaseKey: string, description: string) {
  const phaseData: Record<string, string | null> = {};

  if (phaseKey === 'operational_brief') {
    phaseData.brief = cleanValue(extractField(description, 'Brief') || extractField(description, 'Operational Brief'));
    phaseData.received_date = cleanValue(extractField(description, 'Received Date'));
    phaseData.budget_capex = cleanValue(extractField(description, 'Budget/CAPEX') || extractField(description, 'Budget CAPEX'));
  } else if (phaseKey === 'design') {
    phaseData.start_design_date = cleanValue(extractField(description, 'Start Design Date'));
    phaseData.design_approval = cleanValue(extractField(description, 'Design Approval') || extractField(description, 'Design Approval Date') || extractField(description, 'Design Approval (+1 month)'));
    const designDurationRaw = cleanValue(extractField(description, 'Duration') || extractField(description, 'Duration Delay') || extractField(description, 'Duration : delay(-) / +'));
    phaseData.duration_delay = designDurationRaw && designDurationRaw !== 'delay(-) / +: -' ? designDurationRaw : null;
    phaseData.brief = cleanValue(extractField(description, 'Brief'));
    phaseData.working_drawing = cleanValue(extractField(description, 'Working Drawing') || extractField(description, 'Working Drawing (+3 weeks)'));
  } else if (phaseKey === 'project_control') {
    phaseData.tender_start = cleanValue(extractField(description, 'Tender Start'));
    phaseData.spk_released = cleanValue(extractField(description, 'APS = SPK Released (+3 weeks)') || extractField(description, 'APS SPK Released') || extractField(description, 'APS Release Date') || extractField(description, 'SPK Released'));
    const controlDurationRaw = cleanValue(extractField(description, 'Duration') || extractField(description, 'Duration Delay') || extractField(description, 'Duration : delay(-) / +'));
    phaseData.duration_delay = controlDurationRaw && controlDurationRaw !== 'delay(-) / +: -' ? controlDurationRaw : null;
    phaseData.contract_amount = cleanValue(extractField(description, 'Contract Amount'));
  } else if (phaseKey === 'project_management') {
    phaseData.commence_date = cleanValue(extractField(description, 'Commence Date'));
    phaseData.end_contract = cleanValue(extractField(description, 'End Contract'));
    phaseData.actual_completion = cleanValue(extractField(description, 'Actual Completion'));
    const deviationRaw = cleanValue(extractField(description, 'Deviation') || extractField(description, 'deviation'));
    phaseData.deviation = deviationRaw && deviationRaw !== 'delay(-) / +: -' ? deviationRaw : null;
    phaseData.current_site_progress = cleanValue(extractField(description, 'Current Site Progress'));
  } else if (phaseKey === 'handover') {
    phaseData.bast_1 = cleanValue(extractField(description, 'BAST-1') || extractField(description, 'Bast 1'));
    phaseData.bast_2 = cleanValue(extractField(description, 'BAST-2') || extractField(description, 'Bast 2'));
  }

  target.phases[phaseKey] = phaseData;
}

export async function GET() {
  try {
    if (!API_TOKEN) {
      return NextResponse.json({ success: false, error: 'Missing CLICKUP_API_TOKEN' }, { status: 500 });
    }

    const tasks: any[] = [];
    for (let page = 0; page < 20; page += 1) {
      const response = await fetch(`${API_BASE_URL}/list/${TARGET_LIST_ID}/task?subtasks=true&include_closed=true&page=${page}`, {
        headers: {
          Authorization: API_TOKEN,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      const json = await response.json();
      if (!response.ok) {
        return NextResponse.json({ success: false, error: json?.err || json?.error || 'Failed to fetch ClickUp tasks' }, { status: response.status });
      }

      const pageTasks = Array.isArray(json?.tasks) ? json.tasks : [];
      if (pageTasks.length === 0) break;
      tasks.push(...pageTasks);
      if (pageTasks.length < 100) break;
    }
    const parentMap = new Map<string, string>();
    for (const task of tasks) {
      if (!task?.parent) {
        parentMap.set(String(task.id), String(task.name || '').trim().toLowerCase());
      }
    }

    const projects = new Map<string, any>();

    for (const task of tasks) {
      const parentId = String(task?.parent || '');
      if (!parentId) continue;
      const parentName = parentMap.get(parentId);
      const phaseKey = PHASE_BY_PARENT_ID[parentId] || (parentName ? PHASE_BY_PARENT[parentName] : undefined);
      if (!phaseKey) continue;

      const description = typeof task?.description === 'string' ? task.description : '';
      const unit = extractField(description, 'Unit') || '';
      const projectName = extractField(description, 'Project Name') || String(task?.name || '').replace(/^[A-Za-z]{2,5}\s*-\s*/, '').trim();
      if (!unit || !projectName) continue;

      const project = ensureProject(projects, unit, projectName);
      mergePhaseData(project, phaseKey, description);
    }

    return NextResponse.json({ success: true, data: Array.from(projects.values()) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load milestone phase data from ClickUp' }, { status: 500 });
  }
}
