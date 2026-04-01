const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

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
  const normalizedTeam = teamName.trim().toLowerCase();
  const spacesData = await fetchClickUp(`${API_BASE_URL}/team/${TEAM_ID}/space`);
  const spaces = spacesData?.spaces || [];

  for (const space of spaces) {
    const foldersData = await fetchClickUp(`${API_BASE_URL}/space/${space.id}/folder`);
    const folders = foldersData?.folders || [];
    const folder = folders.find((f: any) => String(f?.name || '').trim().toLowerCase() === normalizedTeam);
    if (folder) {
      const lists = Array.isArray(folder?.lists) ? folder.lists : [];
      if (lists.length > 0) {
        return {
          spaceId: String(space.id),
          spaceName: String(space.name),
          folderId: String(folder.id),
          folderName: String(folder.name),
          listId: String(lists[0].id),
          listName: String(lists[0].name),
        };
      }
    }
  }

  return null;
}

export async function createTaskInTeam(input: {
  teamName: string;
  taskName: string;
  description?: string;
  dueDate?: string;
  assigneeNameOrEmail?: string;
}) {
  const teamList = await resolveTeamList(input.teamName);
  if (!teamList) {
    throw new Error(`Team/folder not found for ${input.teamName}`);
  }

  const assigneeId = await resolveAssigneeId(input.assigneeNameOrEmail);

  const payload: any = {
    name: input.taskName,
    description: input.description || undefined,
    notify_all: true,
  };

  if (input.dueDate) {
    const dueMs = normalizeDateTimeToJakartaMs(input.dueDate);
    if (!Number.isNaN(Number(dueMs)) && dueMs) payload.due_date = dueMs;
  }

  if (assigneeId) {
    payload.assignees = [Number(assigneeId)];
  }

  const data = await fetchClickUp(`${API_BASE_URL}/list/${teamList.listId}/task`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    task: data,
    target: teamList,
    assigneeId,
  };
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
