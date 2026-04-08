import { ClickUpTask } from '@/types/clickup';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const TARGET_SPACE_NAME = 'Project';
const TARGET_LIST_NAME = 'CAPEX Gantt 2026';
const MAPPING_API = '/api/capex/mapping';

export type CapexProject = {
  id: string;
  unit: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  url?: string;
  source: 'clickup' | 'seed';
};

export type CapexMappingRow = {
  no: number;
  clickupTaskId: string | null;
  clickupTaskName?: string | null;
};

const CAPEX_SEED_ROWS = [
  { no: 1, unit: 'SPH', name: 'SPH TENNIS COURT INDOOR' },
  { no: 2, unit: 'SPH', name: 'SPH TENNIS COURT 3' },
  { no: 3, unit: 'ALV', name: "AEI : MUR 6'th : deluxe & bussiness" },
  { no: 4, unit: 'ALV', name: 'LANDSCAPE : BOULEVARD' },
  { no: 5, unit: 'ALV', name: 'LANDSCAPE : GATE' },
  { no: 6, unit: 'ALV', name: 'LANDSCAPE : LOBBY DROP OFF' },
  { no: 7, unit: 'ACC', name: 'REPAIR SURFACE TENNIS COURT 5&6' },
  { no: 8, unit: 'ACC', name: 'PATHWAY REPAIR' },
  { no: 9, unit: 'ASM', name: "AEI - MUR 18'TH : Q1 & Q1A" },
  { no: 10, unit: 'AKB', name: '2025 : CANOPY & FACADE NORTH LOBBY' },
  { no: 11, unit: 'AMD', name: 'FR : FACADE REPAIR & REPAINTING' },
  { no: 12, unit: 'APL', name: '2025 : PPR Pipe Replacement' },
  { no: 13, unit: 'AME', name: '2025 : AME wood parquet' },
] as const;

async function fetchClickUpJson(url: string) {
  if (!API_TOKEN || !TEAM_ID) {
    throw new Error('Missing CLICKUP_API_TOKEN or CLICKUP_TEAM_ID');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: API_TOKEN,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.err || data?.error || response.statusText || 'Unknown ClickUp API error';
    throw new Error(`ClickUp API Error ${response.status}: ${message}`);
  }

  return data;
}

async function loadMappingSeed(): Promise<CapexMappingRow[]> {
  try {
    const res = await fetch(MAPPING_API, { cache: 'no-store' });
    const json = await res.json();
    if (json?.success && Array.isArray(json?.data)) return json.data as CapexMappingRow[];
  } catch {
    // ignore
  }
  return [];
}

function extractProgress(task: any): number | undefined {
  const fields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];

  for (const field of fields) {
    const name = String(field?.name || '').toLowerCase();
    if (!name.includes('progress')) continue;

    const raw = field?.value;
    if (typeof raw === 'number') return Math.max(0, Math.min(100, raw));
    if (typeof raw === 'string') {
      const num = Number(raw.replace('%', '').trim());
      if (!Number.isNaN(num)) return Math.max(0, Math.min(100, num));
    }
  }

  return undefined;
}

function extractCustomField(task: any, wanted: string): string | undefined {
  const fields = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  const lowerWanted = wanted.toLowerCase();

  for (const field of fields) {
    const name = String(field?.name || '').toLowerCase();
    if (name !== lowerWanted) continue;
    const value = field?.value;
    if (value == null) return undefined;
    return String(value);
  }

  return undefined;
}

function formatClickUpDate(ms?: string) {
  if (!ms) return undefined;
  const num = Number(ms);
  if (!Number.isFinite(num)) return undefined;
  return new Date(num).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function mapTaskToCapex(task: ClickUpTask & any, seedRow: { no: number; unit: string; name: string }, seedMapping?: CapexMappingRow): CapexProject {
  const assignee = Array.isArray(task.assignees) && task.assignees.length > 0 ? task.assignees[0]?.username : undefined;
  const description = typeof task.description === 'string' ? task.description : undefined;

  return {
    id: seedMapping?.clickupTaskId ? String(seedMapping.clickupTaskId) : String(task.id),
    unit: seedRow.unit,
    name: seedMapping?.clickupTaskName || seedRow.name,
    start: formatClickUpDate(task.start_date || task.date_created),
    end: formatClickUpDate(task.due_date),
    status: task.status?.status || 'OPEN',
    progress: extractProgress(task),
    note: extractCustomField(task, 'Status Note') || description,
    pic: assignee,
    nextAction: extractCustomField(task, 'Next Action'),
    url: task.url,
    source: 'clickup',
  };
}

export async function getCapexProjects(): Promise<CapexProject[]> {
  const spacesData = await fetchClickUpJson(`${API_BASE_URL}/team/${TEAM_ID}/space`);
  const spaces = Array.isArray(spacesData?.spaces) ? spacesData.spaces : [];
  const targetSpace = spaces.find((space: any) => String(space?.name || '').trim().toLowerCase() === TARGET_SPACE_NAME.toLowerCase());
  if (!targetSpace) {
    throw new Error(`Target space not found: ${TARGET_SPACE_NAME}`);
  }

  const listsData = await fetchClickUpJson(`${API_BASE_URL}/space/${targetSpace.id}/list`);
  const lists = Array.isArray(listsData?.lists) ? listsData.lists : [];

  const targetList = lists.find((list: any) => String(list?.name || '').trim().toLowerCase() === TARGET_LIST_NAME.toLowerCase());
  if (!targetList) {
    throw new Error(`Target list not found: ${TARGET_LIST_NAME}`);
  }

  const data = await fetchClickUpJson(`${API_BASE_URL}/list/${targetList.id}/task?subtasks=true&include_closed=true`);
  const tasks: Array<ClickUpTask & any> = Array.isArray(data?.tasks) ? data.tasks : [];
  const mappingSeed = await loadMappingSeed();
  const mappingByNo = new Map(mappingSeed.map((row) => [row.no, row]));
  const taskByName = new Map(tasks.map((task) => [String(task.name || '').trim().toLowerCase(), task]));

  return CAPEX_SEED_ROWS.map((seedRow) => {
    const seedMapping = mappingByNo.get(seedRow.no);
    const matchedTask = seedMapping?.clickupTaskId
      ? tasks.find((task) => String(task.id) === String(seedMapping.clickupTaskId))
      : taskByName.get(seedRow.name.trim().toLowerCase()) || tasks.find((task) => String(task.name || '').trim().toLowerCase().includes(seedRow.name.trim().toLowerCase()));

    const task = matchedTask || tasks.find((t) => String(t.id) === String(seedMapping?.clickupTaskId));

    if (!task) {
      return {
        id: String(seedMapping?.clickupTaskId || seedRow.no),
        unit: seedRow.unit,
        name: seedMapping?.clickupTaskName || seedRow.name,
        status: 'OPEN',
        source: 'seed',
      };
    }

    return mapTaskToCapex(task, seedRow, seedMapping);
  });
}
