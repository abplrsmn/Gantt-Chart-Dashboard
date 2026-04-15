const API_TOKEN = (process.env.CLICKUP_API_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const TEAM_ID = (process.env.CLICKUP_TEAM_ID || '').trim().replace(/^['"]|['"]$/g, '');
export const CLICKUP_API_BASE_URL = 'https://api.clickup.com/api/v2';

export type ClickUpTargetList = {
  spaceId: string;
  spaceName: string;
  folderId?: string;
  folderName?: string;
  listId: string;
  listName: string;
};

export type ResolveTargetInput = {
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

function normalizeSelector(value?: string) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function normalizeName(value?: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameName(left?: string, right?: string) {
  return normalizeName(left) === normalizeName(right);
}

function looselyMatchesName(left?: string, right?: string) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function matchName(left?: string, right?: string) {
  return sameName(left, right) || looselyMatchesName(left, right);
}

function pickPreferredTarget(targets: ClickUpTargetList[]) {
  if (targets.length === 1) return targets[0];
  const ideaMatch = targets.find((target) => sameName(target.spaceName, 'IDEA'));
  return ideaMatch || targets[0];
}

export async function fetchClickUp(url: string, init?: RequestInit) {
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

async function getTeamSpaces() {
  const spacesData = await fetchClickUp(`${CLICKUP_API_BASE_URL}/team/${TEAM_ID}/space`);
  return Array.isArray(spacesData?.spaces) ? spacesData.spaces : [];
}

async function getSpaceFolders(spaceId: string) {
  const foldersData = await fetchClickUp(`${CLICKUP_API_BASE_URL}/space/${spaceId}/folder`);
  return Array.isArray(foldersData?.folders) ? foldersData.folders : [];
}

async function getSpaceLists(spaceId: string) {
  const listsData = await fetchClickUp(`${CLICKUP_API_BASE_URL}/space/${spaceId}/list`);
  return Array.isArray(listsData?.lists) ? listsData.lists : [];
}

async function getFolderLists(folderId: string) {
  const listsData = await fetchClickUp(`${CLICKUP_API_BASE_URL}/folder/${folderId}/list`);
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

export async function resolveAnyTargetListByName(input: {
  listName: string;
  spaceName?: string;
  candidates?: string[];
}): Promise<ClickUpTargetList> {
  const listName = normalizeSelector(input.listName);
  const preferredSpaceName = normalizeSelector(input.spaceName);
  const candidateNames = Array.from(
    new Set([
      listName,
      ...(input.candidates || []),
    ].map((name) => normalizeSelector(name)).filter(Boolean) as string[])
  );

  if (!candidateNames.length) {
    throw new Error('listName is required');
  }

  const spaces = await getTeamSpaces();
  const preferredSpaces = preferredSpaceName
    ? spaces.filter((space: { name?: string }) => sameName(space?.name, preferredSpaceName))
    : spaces;

  const searchSpaces = preferredSpaces.length > 0 ? preferredSpaces : spaces;
  const matches: ClickUpTargetList[] = [];

  const scanSpaces = async (scanSpacesInput: typeof spaces) => {
    for (const space of scanSpacesInput) {
      const directLists = await getSpaceLists(String(space.id));
      for (const candidate of candidateNames) {
        const directMatch = directLists.find((list: { name?: string }) => matchName(list?.name, candidate));
        if (directMatch) {
          matches.push(asTargetList({ space, list: directMatch }));
        }
      }

      const folders = await getSpaceFolders(String(space.id));
      for (const folder of folders) {
        const folderLists = Array.isArray(folder?.lists) ? folder.lists : await getFolderLists(String(folder.id));
        for (const candidate of candidateNames) {
          const folderMatch = folderLists.find((list: { name?: string }) => matchName(list?.name, candidate));
          if (folderMatch) {
            matches.push(asTargetList({ space, folder, list: folderMatch }));
          }
        }
      }
    }
  };

  await scanSpaces(searchSpaces);
  if (matches.length === 0 && preferredSpaces.length > 0) {
    await scanSpaces(spaces);
  }

  if (matches.length === 0) {
    throw new Error(`Target list not found: ${candidateNames.join(' | ')}${preferredSpaceName ? ` under space "${preferredSpaceName}"` : ''}`);
  }

  return pickPreferredTarget(matches);
}

export async function debugListResolution(input: {
  listName: string;
  preferredSpaceName?: string;
}) {
  const listName = normalizeSelector(input.listName);
  const preferredSpaceName = normalizeSelector(input.preferredSpaceName);

  if (!listName) {
    throw new Error('listName is required');
  }

  const spaces = await getTeamSpaces();
  const preferredSpaces = preferredSpaceName
    ? spaces.filter((space: { name?: string }) => sameName(space?.name, preferredSpaceName))
    : spaces;
  const searchSpaces = preferredSpaces.length > 0 ? preferredSpaces : spaces;

  const matches: Array<ClickUpTargetList> = [];
  const scanned: Array<{
    spaceId: string;
    spaceName: string;
    directListCount: number;
    folderCount: number;
    matchedInSpace: number;
  }> = [];

  for (const space of searchSpaces) {
    const spaceId = String(space?.id || '');
    const spaceName = String(space?.name || '');
    const directLists = await getSpaceLists(spaceId);
    let matchedInSpace = 0;

    for (const list of directLists) {
      if (!sameName(list?.name, listName)) continue;
      matchedInSpace += 1;
      matches.push(asTargetList({
        space: { id: spaceId, name: spaceName },
        list,
      }));
    }

    const folders = await getSpaceFolders(spaceId);
    for (const folder of folders) {
      const folderLists = Array.isArray(folder?.lists) ? folder.lists : await getFolderLists(String(folder.id));
      for (const list of folderLists) {
        if (!sameName(list?.name, listName)) continue;
        matchedInSpace += 1;
        matches.push(asTargetList({
          space: { id: spaceId, name: spaceName },
          folder,
          list,
        }));
      }
    }

    scanned.push({
      spaceId,
      spaceName,
      directListCount: directLists.length,
      folderCount: folders.length,
      matchedInSpace,
    });
  }

  return {
    requested: {
      listName,
      preferredSpaceName: preferredSpaceName || null,
    },
    summary: {
      totalSpaces: spaces.length,
      searchedSpaces: searchSpaces.length,
      preferredSpaceFound: preferredSpaceName ? preferredSpaces.length > 0 : null,
      matchCount: matches.length,
    },
    scanned,
    matches,
  };
}
