import { ClickUpTask } from '@/types/clickup';

const API_TOKEN = process.env.CLICKUP_API_TOKEN || "pk_306777589_IE1K6WMOKBZ7EP1MNTDY8MELGG9TS61V";
const TEAM_ID = process.env.CLICKUP_TEAM_ID || "90182505447";
const API_BASE_URL = 'https://api.clickup.com/api/v2';

export async function getTeamMembers(teamName: string): Promise<any[]> {
  if (!API_TOKEN || !TEAM_ID) return [];

  try {
    // 1. Get Spaces
    const spacesRes = await fetch(`${API_BASE_URL}/team/${TEAM_ID}/space`, {
      headers: { 'Authorization': API_TOKEN },
      next: { revalidate: 0 }
    });
    const spacesData = await spacesRes.json();
    const spaces = spacesData.spaces || [];

    let targetFolderId = null;

    // 2. Find the folder
    for (const space of spaces) {
      const foldersRes = await fetch(`${API_BASE_URL}/space/${space.id}/folder`, {
        headers: { 'Authorization': API_TOKEN },
        next: { revalidate: 0 }
      });
      const foldersData = await foldersRes.json();
      const folders = foldersData.folders || [];
      
      const foundFolder = folders.find((f: any) => f.name.toLowerCase() === teamName.toLowerCase());
      if (foundFolder) {
        targetFolderId = foundFolder.id;
        break;
      }
    }

    if (!targetFolderId) {
      return []; // Folder not found
    }

    // 3. Get lists in folder
    const listsRes = await fetch(`${API_BASE_URL}/folder/${targetFolderId}/list`, {
      headers: { 'Authorization': API_TOKEN },
      next: { revalidate: 0 }
    });
    const listsData = await listsRes.json();
    const lists = listsData.lists || [];

    if (lists.length === 0) return [];

    // 4. Get members of the first list (assuming members are shared at folder level)
    const listId = lists[0].id;
    const membersRes = await fetch(`${API_BASE_URL}/list/${listId}/member`, {
      headers: { 'Authorization': API_TOKEN },
      next: { revalidate: 0 }
    });
    const membersData = await membersRes.json();
    const members = membersData.members || [];

    // 5. Map to expected format
    return members.map((m: any) => ({
      id: m.id.toString(),
      name: m.username || 'Unknown User',
      email: m.email || '',
      initials: m.initials || '?',
      role: 'Member', // Can be refined
      color: m.color || '#3B82F6'
    }));

  } catch (error) {
    console.error('Failed to fetch team members:', error);
    return [];
  }
}
