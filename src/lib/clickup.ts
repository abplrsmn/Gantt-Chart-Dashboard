import { ClickUpTask } from '@/types/clickup';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || process.env.NEXT_PUBLIC_CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '90182505447').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

const DEPARTMENT_LISTS = [
  { department: 'IDEA', team: 'Tech', listId: '901816650757', listName: 'Tasks' },
  { department: 'IDEA', team: 'Data', listId: '901816684091', listName: 'Main' },
  { department: 'IDEA', team: 'Digital', listId: '901816727899', listName: 'General' },
  { department: 'Marketing', team: 'M1', listId: '901816727900', listName: 'General' },
  { department: 'Marketing', team: 'M2', listId: '901816727901', listName: 'General' },
  { department: 'HR', team: 'HR1', listId: '901816727904', listName: 'General' },
  { department: 'Finance', team: 'F1', listId: '901816727903', listName: 'General' },
];

const CAPEX_SOURCE = { department: 'Project', team: 'P1', listId: '901817189531', listName: 'CAPEX Gantt 2026' };

function isAuthOrConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Missing CLICKUP_API_TOKEN or CLICKUP_TEAM_ID') ||
    message.includes('ClickUp API Error 401') ||
    message.includes('OAUTH_025') ||
    message.includes('OAUTH_192')
  );
}

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

function decorateTasks(tasks: ClickUpTask[]) {
  return tasks;
}

async function fetchListTasks(listId: string): Promise<ClickUpTask[]> {
  let page = 0;
  const collected: ClickUpTask[] = [];

  while (true) {
    const data = await fetchClickUpJson(
      `${API_BASE_URL}/list/${listId}/task?page=${page}&include_closed=true&subtasks=true`
    );
    const tasks: ClickUpTask[] = Array.isArray(data?.tasks) ? (data.tasks as ClickUpTask[]) : [];
    if (tasks.length === 0) break;
    collected.push(...tasks);
    if (!data.last_page) break;
    page += 1;
  }

  return collected;
}

function normalizeCapexProjectName(name: string) {
  return String(name || '').trim().toLowerCase();
}

async function fetchStructuredTasks() {
  const collected = new Map<string, ClickUpTask>();

  for (const source of DEPARTMENT_LISTS) {
    const tasks = await fetchListTasks(source.listId);
    for (const task of tasks) {
      collected.set(task.id, {
        ...task,
        department: source.department,
        list: {
          ...(task as any).list,
          id: source.listId,
          name: source.listName,
        } as any,
        team: source.team,
      } as ClickUpTask);
    }
  }

  const capexTasks = await fetchListTasks(CAPEX_SOURCE.listId);
  const capexProjects = new Map<string, ClickUpTask>();
  for (const task of capexTasks) {
    const parent = (task as any).parent;
    if (parent) continue;
    const key = normalizeCapexProjectName(task.name || task.id);
    if (!capexProjects.has(key)) {
      capexProjects.set(key, {
        ...task,
        department: CAPEX_SOURCE.department,
        list: {
          ...(task as any).list,
          id: CAPEX_SOURCE.listId,
          name: CAPEX_SOURCE.listName,
        } as any,
        team: CAPEX_SOURCE.team,
      } as ClickUpTask);
    }
  }
  for (const [key, task] of capexProjects.entries()) {
    collected.set(`capex:${key}`, task);
  }

  return Array.from(collected.values()).sort(
    (a, b) => parseInt(b.date_updated || b.date_created || '0') - parseInt(a.date_updated || a.date_created || '0')
  );
}

async function findFolderByTeamName(teamName: string): Promise<any | null> {
  const normalizedTeamName = teamName.toLowerCase();
  const spacesData = await fetchClickUpJson(`${API_BASE_URL}/team/${TEAM_ID}/space`);
  const spaces = spacesData.spaces || [];

  for (const space of spaces) {
    const foldersData = await fetchClickUpJson(`${API_BASE_URL}/space/${space.id}/folder`);
    const folders = foldersData.folders || [];
    const foundFolder = folders.find((f: any) => f.name?.toLowerCase() === normalizedTeamName);
    if (foundFolder) {
      return foundFolder;
    }
  }

  return null;
}

export async function getTasks(): Promise<ClickUpTask[]> {
  try {
    const tasks = await fetchStructuredTasks();
    return decorateTasks(tasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    if (isAuthOrConfigError(error)) {
      throw error;
    }
    throw error;
  }
}

export async function getTeamMembers(teamName: string): Promise<any[]> {
  if (!teamName) return [];

  try {
    const targetFolder = await findFolderByTeamName(teamName);

    if (!targetFolder) return [];

    const normalizedMembers = new Map<string, any>();

    const addMember = (user: any, role = 'Member') => {
      if (!user) return;

      const id = user.id?.toString();
      if (!id) return;

      const name = user.username || user.email || 'Unknown User';
      const generatedInitials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase() || '?';

      normalizedMembers.set(id, {
        id,
        name,
        email: user.email || '',
        initials: user.initials || generatedInitials,
        role,
        color: user.color || '#3B82F6'
      });
    };

    try {
      const folderData = await fetchClickUpJson(`${API_BASE_URL}/folder/${targetFolder.id}`);
      const folderMembers = folderData.members || [];
      for (const fm of folderMembers) addMember(fm.user || fm, 'Folder Access');
    } catch {
      // Continue with list members fallback.
    }

    const listsData = await fetchClickUpJson(`${API_BASE_URL}/folder/${targetFolder.id}/list`);
    const lists = listsData.lists || [];
    for (const list of lists) {
      try {
        const membersData = await fetchClickUpJson(`${API_BASE_URL}/list/${list.id}/member`);
        const members = membersData.members || [];
        for (const m of members) addMember(m, 'Member');
      } catch {
        // Ignore list without accessible member payload.
      }
    }

    return Array.from(normalizedMembers.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  } catch (error) {
    console.error('Failed to fetch team members:', error);
    if (isAuthOrConfigError(error)) {
      throw error;
    }
    return [];
  }
}

export async function getTeamFolderTaskLists(teamName: string): Promise<{
  folder: { id: string; name: string } | null;
  lists: Array<{
    id: string;
    name: string;
    totalTasks: number;
    openTasks: number;
    closedTasks: number;
    tasks: Array<{
      id: string;
      name: string;
      status: string;
      dueDate: string | null;
      url: string;
      assignees: string[];
    }>;
  }>;
}> {
  if (!teamName) {
    return { folder: null, lists: [] };
  }

  try {
    const targetFolder = await findFolderByTeamName(teamName);
    if (!targetFolder) {
      return { folder: null, lists: [] };
    }

    const listsData = await fetchClickUpJson(`${API_BASE_URL}/folder/${targetFolder.id}/list`);
    const lists = Array.isArray(listsData?.lists) ? listsData.lists : [];

    const listsWithTasks = await Promise.all(
      lists.map(async (list: any) => {
        const listId = String(list?.id || '');
        if (!listId) {
          return {
            id: '',
            name: String(list?.name || 'Untitled List'),
            totalTasks: 0,
            openTasks: 0,
            closedTasks: 0,
            tasks: [],
          };
        }

        const data = await fetchClickUpJson(
          `${API_BASE_URL}/list/${listId}/task?include_closed=true&subtasks=true`
        );
        const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

        const normalizedTasks = tasks.map((task: any) => {
          const status = String(task?.status?.status || 'unknown');
          const dueDate = task?.due_date ? String(task.due_date) : null;
          const assignees = Array.isArray(task?.assignees)
            ? task.assignees
              .map((a: any) => String(a?.username || a?.email || '').trim())
              .filter(Boolean)
            : [];

          return {
            id: String(task?.id || ''),
            name: String(task?.name || 'Untitled Task'),
            status,
            dueDate,
            url: String(task?.url || ''),
            assignees,
          };
        });

        const closedTasks = normalizedTasks.filter((t: { status: string }) => {
          const s = t.status.toLowerCase();
          return s === 'closed' || s === 'complete' || s === 'completed';
        }).length;
        const totalTasks = normalizedTasks.length;

        return {
          id: listId,
          name: String(list?.name || 'Untitled List'),
          totalTasks,
          closedTasks,
          openTasks: totalTasks - closedTasks,
          tasks: normalizedTasks,
        };
      })
    );

    return {
      folder: { id: String(targetFolder.id), name: String(targetFolder.name || teamName) },
      lists: listsWithTasks.filter((l) => l.id),
    };
  } catch (error) {
    console.error('Failed to fetch team folder task lists:', error);
    if (isAuthOrConfigError(error)) {
      throw error;
    }
    return { folder: null, lists: [] };
  }
}

export async function getIDEASpaceEmployeeCount(): Promise<number> {
  try {
    const data = await fetchClickUpJson(`${API_BASE_URL}/team`);
    const members = data.teams?.[0]?.members || [];
    return members.length;
  } catch (error) {
    console.error('Failed to fetch workspace members:', error);
    return 0;
  }
}

export async function getOrganizationStructure(): Promise<{
  departments: Array<{ name: string; spaceId: string; teams: string[] }>;
  totalDepartments: number;
  totalTeams: number;
}> {
  try {
    const spacesData = await fetchClickUpJson(`${API_BASE_URL}/team/${TEAM_ID}/space`);
    const spaces = Array.isArray(spacesData.spaces) ? spacesData.spaces : [];

    const departments = await Promise.all(
      spaces.map(async (space: any) => {
        const spaceId = String(space?.id || '');
        const spaceName = String(space?.name || 'Unnamed');

        let teams: string[] = [];
        try {
          const foldersData = await fetchClickUpJson(`${API_BASE_URL}/space/${spaceId}/folder`);
          const folders = Array.isArray(foldersData.folders) ? foldersData.folders : [];
          teams = folders
            .map((folder: any) => String(folder?.name || '').trim())
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b));
        } catch (error) {
          console.error(`Failed to fetch folders for space ${spaceName}:`, error);
        }

        return {
          name: spaceName,
          spaceId,
          teams,
        };
      })
    );

    const filteredDepartments = departments
      .filter((dept) => dept.name && dept.spaceId)
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalTeams = filteredDepartments.reduce((sum, dept) => sum + dept.teams.length, 0);

    return {
      departments: filteredDepartments,
      totalDepartments: filteredDepartments.length,
      totalTeams,
    };
  } catch (error) {
    console.error('Failed to fetch organization structure:', error);
    return {
      departments: [],
      totalDepartments: 0,
      totalTeams: 0,
    };
  }
}
