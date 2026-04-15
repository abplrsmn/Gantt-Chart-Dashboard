const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';
const CAPEX_TARGET_SPACE_NAME = (process.env.CAPEX_TARGET_SPACE_NAME || 'Project').trim();
const CAPEX_TARGET_LIST_NAME = (process.env.CAPEX_TARGET_LIST_NAME || 'CAPEX Gantt 2026').trim();

type ClickUpTargetList = {
  spaceId: string;
  spaceName: string;
  folderId?: string;
  folderName?: string;
  listId: string;
  listName: string;
};

type ResolveTargetInput = {
  spaceName?: string;
  folderName?: string;
  teamName?: string;
  listName?: string;
  defaultSpaceName?: string;
  defaultListName?: string;
};

function required(name: string, value?: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function pad2(value: string | number) {
  return String(value).padStart(2, '0');
}

function normalizeDateInput(input: string) {
  const text = input.trim();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const lowered = text.toLowerCase();
  const monthMap: Record<string, string> = {
    januari: '01',
    january: '01',
    februari: '02',
    february: '02',
    maret: '03',
    march: '03',
    april: '04',
    mei: '05',
    may: '05',
    juni: '06',
    june: '06',
    juli: '07',
    july: '07',
    agustus: '08',
    august: '08',
    september: '09',
    oktober: '10',
    october: '10',
    november: '11',
    desember: '12',
    december: '12',
  };

  const named = lowered.match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/i);
  if (named) {
    const month = monthMap[named[2].toLowerCase()];
    if (month) return `${named[3]}-${month}-${pad2(named[1])}`;
  }

  return null;
}

function normalizeDateTimeToJakartaMs(input?: string) {
  if (!input) return null;
  const raw = input.trim();

  const fullIso = raw.match(/\b(20\d{2}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (fullIso) {
    const [, date, hh, mm, ss] = fullIso;
    return new Date(`${date}T${pad2(hh)}:${mm}:${ss || '00'}+07:00`).getTime();
  }

  const named = raw.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})(?:\s+(\d{1,2}):(\d{2}))?\b/);
  if (named) {
    const date = normalizeDateInput(`${named[1]} ${named[2]} ${named[3]}`);
    if (!date) return null;
    const hh = pad2(named[4] || '00');
    const mm = named[5] || '00';
    return new Date(`${date}T${hh}:${mm}:00+07:00`).getTime();
  }

  const justDate = normalizeDateInput(raw);
  if (justDate) {
    return new Date(`${justDate}T23:59:00+07:00`).getTime();
  }

  return null;
}

async function fetchClickUp(url: string, init?: RequestInit) {
  required('CLICKUP_API_TOKEN', API_TOKEN);
  required('CLICKUP_TEAM_ID', TEAM_ID);

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: API_TOKEN,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.err || data?.error || `ClickUp API error ${response.status}`);
  }

  return data;
}

function normalizeSelector(value?: string) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function sameName(left?: string, right?: string) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function pickPreferredTarget(targets: ClickUpTargetList[]) {
  if (targets.length === 1) return targets[0];
  const ideaMatch = targets.find((target) => sameName(target.spaceName, 'IDEA'));
  return ideaMatch || targets[0];
}

async function getTeamSpaces() {
  const spacesData = await fetchClickUp(`${API_BASE_URL}/team/${TEAM_ID}/space`);
  return Array.isArray(spacesData?.spaces) ? spacesData.spaces : [];
}

async function getSpaceFolders(spaceId: string) {
  const foldersData = await fetchClickUp(`${API_BASE_URL}/space/${spaceId}/folder`);
  return Array.isArray(foldersData?.folders) ? foldersData.folders : [];
}

async function getSpaceLists(spaceId: string) {
  const listsData = await fetchClickUp(`${API_BASE_URL}/space/${spaceId}/list`);
  return Array.isArray(listsData?.lists) ? listsData.lists : [];
}

async function getFolderLists(folderId: string) {
  const listsData = await fetchClickUp(`${API_BASE_URL}/folder/${folderId}/list`);
  return Array.isArray(listsData?.lists) ? listsData.lists : [];
}

function asTargetList(args: {
  space: { id?: string | number; name?: string };
  folder?: { id?: string | number; name?: string };
  list: { id?: string | number; name?: string };
}): ClickUpTargetList {
  return {
    spaceId: String(args.space.id),
    spaceName: String(args.space.name),
    folderId: args.folder ? String(args.folder.id) : undefined,
    folderName: args.folder ? String(args.folder.name) : undefined,
    listId: String(args.list.id),
    listName: String(args.list.name),
  };
}

export async function resolveTargetList(input: ResolveTargetInput): Promise<ClickUpTargetList> {
  const teamName = normalizeSelector(input.teamName);
  const folderName = normalizeSelector(input.folderName) || teamName;
  const listName = normalizeSelector(input.listName);
  const spaceName = normalizeSelector(input.spaceName);
  const defaultSpaceName = normalizeSelector(input.defaultSpaceName);
  const defaultListName = normalizeSelector(input.defaultListName);

  if (!folderName && !listName && !(defaultSpaceName && defaultListName)) {
    throw new Error('No target selector provided. Provide list, folder/team, or default space+list target.');
  }

  const spaces = await getTeamSpaces();
  const filteredSpaces = spaceName
    ? spaces.filter((space: { name?: string }) => sameName(space?.name, spaceName))
    : spaces;

  if (spaceName && filteredSpaces.length === 0) {
    throw new Error(`Target space not found: ${spaceName}`);
  }

  if (listName && folderName) {
    const matches: ClickUpTargetList[] = [];

    for (const space of filteredSpaces) {
      const folders = await getSpaceFolders(String(space.id));
      const folder = folders.find((f: { name?: string }) => sameName(f?.name, folderName));
      if (!folder) continue;

      const lists = await getFolderLists(String(folder.id));
      const list = lists.find((l: { name?: string }) => sameName(l?.name, listName));
      if (!list) continue;

      matches.push(asTargetList({ space, folder, list }));
    }

    if (matches.length === 0) {
      throw new Error(
        `Target list "${listName}" not found in folder/team "${folderName}"${spaceName ? ` under space "${spaceName}"` : ''}`
      );
    }

    return pickPreferredTarget(matches);
  }

  if (listName) {
    const matches: ClickUpTargetList[] = [];

    for (const space of filteredSpaces) {
      const directLists = await getSpaceLists(String(space.id));
      const directMatch = directLists.find((l: { name?: string }) => sameName(l?.name, listName));
      if (directMatch) {
        matches.push(asTargetList({ space, list: directMatch }));
      }

      const folders = await getSpaceFolders(String(space.id));
      for (const folder of folders) {
        const folderLists = Array.isArray(folder?.lists) ? folder.lists : await getFolderLists(String(folder.id));
        const list = folderLists.find((l: { name?: string }) => sameName(l?.name, listName));
        if (list) {
          matches.push(asTargetList({ space, folder, list }));
        }
      }
    }

    if (matches.length === 0) {
      throw new Error(`Target list not found: ${listName}${spaceName ? ` under space "${spaceName}"` : ''}`);
    }

    return pickPreferredTarget(matches);
  }

  if (folderName) {
    const matches: ClickUpTargetList[] = [];

    for (const space of filteredSpaces) {
      const folders = await getSpaceFolders(String(space.id));
      const folder = folders.find((f: { name?: string }) => sameName(f?.name, folderName));
      if (!folder) continue;

      const lists = Array.isArray(folder?.lists) ? folder.lists : await getFolderLists(String(folder.id));
      if (!Array.isArray(lists) || lists.length === 0) {
        throw new Error(`Folder/team "${folderName}" found but has no accessible lists`);
      }

      matches.push(asTargetList({ space, folder, list: lists[0] }));
    }

    if (matches.length === 0) {
      throw new Error(`Target folder/team not found: ${folderName}${spaceName ? ` under space "${spaceName}"` : ''}`);
    }

    return pickPreferredTarget(matches);
  }

  if (defaultSpaceName && defaultListName) {
    const targetSpace = spaces.find((space: { name?: string }) => sameName(space?.name, defaultSpaceName));
    if (!targetSpace) {
      throw new Error(`Default target space not found: ${defaultSpaceName}`);
    }

    const directLists = await getSpaceLists(String(targetSpace.id));
    const directMatch = directLists.find((list: { name?: string }) => sameName(list?.name, defaultListName));
    if (directMatch) {
      return asTargetList({ space: targetSpace, list: directMatch });
    }

    const folders = await getSpaceFolders(String(targetSpace.id));
    for (const folder of folders) {
      const folderLists = Array.isArray(folder?.lists) ? folder.lists : await getFolderLists(String(folder.id));
      const listMatch = folderLists.find((list: { name?: string }) => sameName(list?.name, defaultListName));
      if (listMatch) {
        return asTargetList({ space: targetSpace, folder, list: listMatch });
      }
    }

    throw new Error(`Default target list not found: ${defaultListName}`);
  }

  throw new Error('Unable to resolve ClickUp target. Provide a valid list or folder/team selector.');
}

export async function getWorkspaceMembers() {
  const data = await fetchClickUp(`${API_BASE_URL}/team`);
  const members = data?.teams?.[0]?.members || [];
  return members.map((m: any) => ({
    id: String(m?.user?.id || m?.id || ''),
    username: m?.user?.username || m?.username || '',
    email: m?.user?.email || m?.email || '',
    initials: m?.user?.initials || m?.initials || '',
  }));
}

export async function resolveAssigneeId(nameOrEmail?: string) {
  if (!nameOrEmail) return null;
  const needle = nameOrEmail.trim().toLowerCase();
  const compactNeedle = needle.replace(/\s+/g, '');
  const members = await getWorkspaceMembers();
  const exact = members.find((m: any) =>
    m.username?.toLowerCase() === needle || m.email?.toLowerCase() === needle
  );
  if (exact) return exact.id;

  const partial = members.find((m: any) => {
    const username = m.username?.toLowerCase() || '';
    const email = m.email?.toLowerCase() || '';
    return (
      username.includes(needle) ||
      email.includes(needle) ||
      username.replace(/\s+/g, '').includes(compactNeedle)
    );
  });
  return partial?.id || null;
}

export async function resolveTeamList(teamName?: string) {
  if (!teamName) return null;
  try {
    return await resolveTargetList({ teamName });
  } catch {
    return null;
  }
}

export async function createTaskInTarget(input: {
  taskName: string;
  description?: string;
  dueDate?: string;
  startDate?: string;
  assigneeNameOrEmail?: string;
  spaceName?: string;
  folderName?: string;
  teamName?: string;
  listName?: string;
  defaultSpaceName?: string;
  defaultListName?: string;
}) {
  const targetList = await resolveTargetList({
    spaceName: input.spaceName,
    folderName: input.folderName,
    teamName: input.teamName,
    listName: input.listName,
    defaultSpaceName: input.defaultSpaceName,
    defaultListName: input.defaultListName,
  });

  const assigneeId = await resolveAssigneeId(input.assigneeNameOrEmail);

  const payload: {
    name: string;
    description?: string;
    notify_all: boolean;
    due_date?: number;
    start_date?: number;
    assignees?: number[];
  } = {
    name: input.taskName,
    description: input.description || undefined,
    notify_all: true,
  };

  const dueMs = normalizeDateTimeToJakartaMs(input.dueDate);
  if (!Number.isNaN(Number(dueMs)) && dueMs) payload.due_date = dueMs;

  const startMs = normalizeDateTimeToJakartaMs(input.startDate);
  if (!Number.isNaN(Number(startMs)) && startMs) payload.start_date = startMs;

  if (assigneeId) {
    payload.assignees = [Number(assigneeId)];
  }

  const data = await fetchClickUp(`${API_BASE_URL}/list/${targetList.listId}/task`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    task: data,
    target: targetList,
    assigneeId,
  };
}

export async function createTaskInTeam(input: {
  teamName: string;
  taskName: string;
  description?: string;
  dueDate?: string;
  assigneeNameOrEmail?: string;
}) {
  const teamList = await resolveTargetList({ teamName: input.teamName });
  if (!teamList?.listId) {
    throw new Error(`Team/folder not found for ${input.teamName}`);
  }

  return createTaskInTarget({
    taskName: input.taskName,
    description: input.description,
    dueDate: input.dueDate,
    assigneeNameOrEmail: input.assigneeNameOrEmail,
    teamName: input.teamName,
  });
}

export async function createTaskInCapexProjectList(input: {
  taskName: string;
  description?: string;
  dueDate?: string;
  startDate?: string;
  assigneeNameOrEmail?: string;
}) {
  return createTaskInTarget({
    taskName: input.taskName,
    description: input.description,
    dueDate: input.dueDate,
    startDate: input.startDate,
    assigneeNameOrEmail: input.assigneeNameOrEmail,
    defaultSpaceName: CAPEX_TARGET_SPACE_NAME,
    defaultListName: CAPEX_TARGET_LIST_NAME,
  });
}

export async function updateTaskStatus(taskId: string, status: string) {
  if (!taskId?.trim()) {
    throw new Error('taskId is required');
  }
  if (!status?.trim()) {
    throw new Error('status is required');
  }

  const data = await fetchClickUp(`${API_BASE_URL}/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: status.trim() }),
  });

  return {
    task: data,
    status: data?.status,
  };
}
