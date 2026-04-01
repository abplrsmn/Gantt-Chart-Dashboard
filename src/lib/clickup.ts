import { ClickUpTask } from '@/types/clickup';

const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
const API_BASE_URL = 'https://api.clickup.com/api/v2';

function isAuthOrConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Missing CLICKUP_API_TOKEN or CLICKUP_TEAM_ID') ||
    message.includes('ClickUp API Error 401') ||
    message.includes('OAUTH_025')
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

export async function getTasks(): Promise<ClickUpTask[]> {
  try {
    const data = await fetchClickUpJson(`${API_BASE_URL}/team/${TEAM_ID}/task?subtasks=true&include_closed=true`);
    let tasks: ClickUpTask[] = data.tasks || [];

    tasks = tasks.map((task) => {
      let assignedDept = 'General';
      const spaceId = (task as any).space?.id;
      if (spaceId === '901810204419') assignedDept = 'IDEA';
      else if (spaceId === '901810204420') assignedDept = 'Marketing';
      else if (spaceId === '901810204444') assignedDept = 'Finance';
      else if (spaceId === '901810204446') assignedDept = 'HR';
      
      return { ...task, department: assignedDept };
    });

    return tasks;
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return [];
  }
}

export async function getTeamMembers(teamName: string): Promise<any[]> {
  if (!teamName) return [];

  try {
    const normalizedTeamName = teamName.toLowerCase();
    const spacesData = await fetchClickUpJson(`${API_BASE_URL}/team/${TEAM_ID}/space`);
    const spaces = spacesData.spaces || [];

    let targetFolder: any = null;
    for (const space of spaces) {
      const foldersData = await fetchClickUpJson(`${API_BASE_URL}/space/${space.id}/folder`);
      const folders = foldersData.folders || [];
      const foundFolder = folders.find((f: any) => f.name?.toLowerCase() === normalizedTeamName);
      if (foundFolder) {
        targetFolder = foundFolder;
        break;
      }
    }

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

    // Try folder-level member payload first when available.
    try {
      const folderData = await fetchClickUpJson(`${API_BASE_URL}/folder/${targetFolder.id}`);
      const folderMembers = folderData.members || [];
      for (const fm of folderMembers) addMember(fm.user || fm, 'Folder Access');
    } catch {
      // Continue with list members fallback.
    }

    // Aggregate list members from all lists under the folder.
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

/**
 * Update: Mengambil jumlah karyawan TOTAL di seluruh Workspace (Team) Aryaduta.
 * Karena data member per Space seringkali tidak update via API ClickUp.
 */
export async function getIDEASpaceEmployeeCount(): Promise<number> {
  try {
    const data = await fetchClickUpJson(`${API_BASE_URL}/team`);
    const members = data.teams?.[0]?.members || [];
    
    // Kita tampilkan jumlah total orang yang sudah join di Workspace Mas Abraham
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
            .sort((a, b) => a.localeCompare(b));
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
