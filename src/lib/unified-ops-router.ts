import { promises as fs } from 'fs';
import path from 'path';
import { parseOpsIntent, parseStructuredOpsCommand } from '@/lib/ops-intent';
import { resolveTaskRouting } from '@/lib/task-routing';
import { syncCapexTelegramUpdate } from '@/lib/capex-telegram-sync';
import { createTaskInCapexProjectList, createTaskInTarget } from '@/lib/clickup-write';

type UnifiedInput = {
  text?: string;
  message?: string;
  caption?: string;
  groupName?: string | null;
  group?: string | null;
  chatTitle?: string | null;
  team?: string;
  folder?: string;
  list?: string;
  space?: string;
  context?: Record<string, any>;
  payload?: Record<string, any>;
  [key: string]: any;
};

type AuditEntry = {
  ts: string;
  routeType: 'capex' | 'idea-task' | 'unknown' | 'error';
  text: string;
  groupName?: string | null;
  routing?: unknown;
  parsed?: unknown;
  task?: { id?: string; name?: string; url?: string } | null;
  target?: unknown;
  matchedSummary?: unknown;
  action?: string | null;
  error?: string | null;
};

const AUDIT_LOG_PATH = path.join(process.cwd(), 'logs', 'ops-router-audit.jsonl');

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function getInboundText(body: UnifiedInput) {
  return firstNonEmptyString(
    body?.text,
    body?.message,
    body?.caption,
    body?.context?.text,
    body?.payload?.text,
    body?.payload?.message
  );
}

function getInboundGroupName(body: UnifiedInput) {
  return firstNonEmptyString(
    body?.groupName,
    body?.group,
    body?.chatTitle,
    body?.context?.groupName,
    body?.context?.chatTitle,
    body?.context?.conversationName
  ) || null;
}

function getSelectors(body: UnifiedInput) {
  return {
    teamName: firstNonEmptyString(body?.team, body?.payload?.team, body?.context?.teamName) || undefined,
    folderName: firstNonEmptyString(body?.folder, body?.payload?.folder, body?.context?.folderName) || undefined,
    listName: firstNonEmptyString(body?.list, body?.payload?.list, body?.context?.listName) || undefined,
    spaceName: firstNonEmptyString(body?.space, body?.payload?.space, body?.context?.spaceName) || undefined,
  };
}

function isLikelyCapexText(text: string) {
  const lowered = text.toLowerCase();
  const unitCode = /\b(sph|alv|asm|apl|amd|acc|akb|ame|ajk|ikg|abd|apk)\b/i.test(text);
  const projectSignals = [
    'capex',
    'end contract',
    'commence date',
    'current site progress',
    'contract amount',
    'budget capex',
    'received date',
    'start design date',
    'tender start',
    'spk released',
    'actual completion',
    'bast',
  ].some((signal) => lowered.includes(signal));

  const updateSignals = [
    'update',
    'buat proyek baru',
    'buat project baru',
    'buat capex',
    'progress jadi',
    'progress',
  ].some((signal) => lowered.includes(signal));

  return unitCode || projectSignals || updateSignals;
}

function parseCapexNaturalLanguage(text: string) {
  const raw = text.trim();
  const unitMatch = raw.match(/\b(SPH|ALV|ASM|APL|AMD|ACC|AKB|AME|AJK|IKG|ABD|APK)\b/i);
  const progressMatch = raw.match(/progress\s*(?:jadi|=|:)?\s*([^,\n]+)/i);
  const remarksMatch = raw.match(/(?:remarks?|status(?:nya)?|status log|catatan)\s*(?:jadi|=|:)?\s*([^\n]+)/i);
  const assignMatch = raw.match(/assign\s+(?:ke\s+)?@?([A-Za-z0-9._\- ]+)/i);
  const phaseMatch = raw.match(/(?:phase|fase|milestone)\s*(?:=|:|nya|di)?\s*\b(PR|HoD|HOD|PC|PM|Operational Brief|Design|Project Control|Project Management|Handover)\b/i)
    || raw.match(/^\s*\b(PR|HoD|HOD|PC|PM)\b\s*[-:|]/i);
  const projectMatch = raw.match(/(?:update|buat proyek baru|buat project baru|buat capex)\s+(?:project\s+)?(?:capex\s+)?(?:unit\s+)?(?:SPH|ALV|ASM|APL|AMD|ACC|AKB|AME|AJK|IKG|ABD|APK)?\s*([A-Za-z0-9'&()\-/. ]+?)(?:\s+progress\b|\s+remarks?\b|\s+status\b|$)/i);

  return {
    unit: unitMatch?.[1]?.toUpperCase() || '',
    project: projectMatch?.[1]?.trim() || '',
    phase: phaseMatch?.[1]?.trim(),
    currentSiteProgress: progressMatch?.[1]?.trim(),
    remarks: remarksMatch?.[1]?.trim(),
    assignee: assignMatch?.[1]?.trim(),
  };
}

function buildUsageGuide() {
  return {
    capex: [
      'Update CAPEX natural:',
      '"Tolong update SPH Tennis Court 3 progress jadi 60% dan remarks aspal kelar"',
      '',
      'CAPEX structured payload fields:',
      'unit, project, commenceDate, endContract, budgetCapex, contractAmount, currentSiteProgress, remarks, receivedDate, startDesignDate, tenderStart, spkReleased, actualCompletion, assignee',
    ].join('\n'),
    idea: [
      'TASK pipe format:',
      'TASK | title = follow up API error | team = tech | assignee = Budi | due = 2026-04-18',
      '',
      'TASK natural format:',
      '"Tolong bikin task buat Tech, follow up API error dashboard, assign ke Budi, deadline besok"',
    ].join('\n'),
  };
}

function buildIdeaTelegramMessage(input: {
  teamName?: string;
  taskName?: string;
  dueDate?: string;
  assignee?: string;
  url?: string;
}) {
  const lines = [
    '✅ Task Sync Success!',
    `* Team: ${input.teamName || '-'}`,
    `* Task: ${input.taskName || '-'}`,
    `* Due: ${input.dueDate || '-'}`,
    `* Assignee: ${input.assignee || '-'}`,
    `* ClickUp: ${input.url || 'created'}`,
  ];

  return lines.join('\n');
}

async function appendAuditLog(entry: AuditEntry) {
  try {
    await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    await fs.appendFile(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (error) {
    console.error('Failed to append ops router audit log:', error);
  }
}

export async function executeUnifiedOpsRoute(body: UnifiedInput) {
  const text = getInboundText(body);
  const groupName = getInboundGroupName(body);
  const selectors = getSelectors(body);

  if (!text) {
    throw new Error('text is required');
  }

  const structured = parseStructuredOpsCommand(text);
  const intent = parseOpsIntent(text);
  const routing = resolveTaskRouting({
    text,
    groupName,
    intentTeam: typeof intent?.fields?.team === 'string' ? intent.fields.team : null,
    isProjectCommand: structured?.commandType === 'PROJECT',
    hasProjectUnit: !!(structured?.fields?.unit || (intent?.fields as any)?.unit),
    explicitSelectors: selectors,
  });

  const naturalCapex = parseCapexNaturalLanguage(text);
  const shouldUseCapex =
    routing.useCapexDefault ||
    structured?.commandType === 'PROJECT' ||
    intent.intent === 'project' ||
    isLikelyCapexText(text);

  if (shouldUseCapex) {
    const fields = structured?.commandType === 'PROJECT' ? structured.fields : null;
    const mode = /buat proyek baru|buat project baru|buat capex/i.test(text) ? 'create' : 'upsert';

    const result = await syncCapexTelegramUpdate({
      mode,
      unit: firstNonEmptyString(body?.unit, body?.payload?.unit, fields?.unit, naturalCapex.unit),
      project: firstNonEmptyString(body?.project, body?.taskName, body?.payload?.project, fields?.title, fields?.project, naturalCapex.project),
      description: firstNonEmptyString(body?.description, body?.payload?.description, fields?.description, text),
      commenceDate: firstNonEmptyString(body?.commenceDate, body?.startDate, fields?.start),
      endContract: firstNonEmptyString(body?.endContract, body?.dueDate, body?.deadline, fields?.end, fields?.due),
      budgetCapex: body?.budgetCapex ?? fields?.budget_capex,
      contractAmount: body?.contractAmount ?? fields?.contract_amount,
      remarks: firstNonEmptyString(body?.remarks, body?.note, fields?.remarks, fields?.note, naturalCapex.remarks),
      currentSiteProgress: body?.currentSiteProgress ?? body?.progress ?? fields?.progress ?? naturalCapex.currentSiteProgress,
      receivedDate: firstNonEmptyString(body?.receivedDate, fields?.received_date),
      startDesignDate: firstNonEmptyString(body?.startDesignDate, fields?.start_design_date),
      tenderStart: firstNonEmptyString(body?.tenderStart, fields?.tender_start),
      spkReleased: firstNonEmptyString(body?.spkReleased, fields?.spk_released),
      actualCompletion: firstNonEmptyString(body?.actualCompletion, fields?.actual_completion),
      assignee: firstNonEmptyString(body?.assignee, body?.assign, body?.pic, fields?.pic, naturalCapex.assignee),
      phase: firstNonEmptyString(body?.phase, body?.fase, body?.milestone, fields?.phase, fields?.fase, fields?.milestone, naturalCapex.phase),
    });

    const payload = {
      success: true,
      routeType: 'capex' as const,
      routing,
      parsed: result.normalized,
      task: {
        id: result.task?.id,
        name: result.task?.name,
        url: result.task?.url,
      },
      target: result.target,
      matchedSummary: result.matchedSummary || null,
      action: result.action,
      telegramMessage: result.telegramMessage,
      usageGuide: buildUsageGuide(),
    };

    await appendAuditLog({
      ts: new Date().toISOString(),
      routeType: 'capex',
      text,
      groupName,
      routing,
      parsed: result.normalized,
      task: payload.task,
      target: result.target,
      matchedSummary: result.matchedSummary || null,
      action: result.action,
      error: null,
    });

    return payload;
  }

  if (intent.intent !== 'task') {
    const payload = {
      success: false,
      routeType: 'unknown' as const,
      routing,
      usageGuide: buildUsageGuide(),
      followUpQuestion: 'Mau update project CAPEX atau bikin task IDEA biasa?',
      telegramMessage: 'Aku belum yakin ini update CAPEX atau task IDEA biasa. Coba sebutkan unit/project untuk CAPEX, atau team/title untuk task biasa ya.',
    };

    await appendAuditLog({
      ts: new Date().toISOString(),
      routeType: 'unknown',
      text,
      groupName,
      routing,
      parsed: intent.fields,
      task: null,
      target: null,
      matchedSummary: null,
      action: null,
      error: payload.followUpQuestion,
    });

    return payload;
  }

  const fields = { ...(intent.fields as any) };
  const result = routing.useCapexDefault
    ? await createTaskInCapexProjectList({
        taskName: fields.taskTitle,
        description: fields.description || text,
        dueDate: fields.dueDateHint || undefined,
        assigneeNameOrEmail: fields.assignee || undefined,
      })
    : await createTaskInTarget({
        taskName: fields.taskTitle,
        description: fields.description || text,
        dueDate: fields.dueDateHint || undefined,
        assigneeNameOrEmail: fields.assignee || undefined,
        teamName: fields.team || selectors.teamName || routing.selectors?.teamName,
        folderName: fields.folder || selectors.folderName || routing.selectors?.folderName,
        listName: fields.list || selectors.listName || routing.selectors?.listName,
        spaceName: fields.space || selectors.spaceName || routing.selectors?.spaceName,
      });

  const payload = {
    success: true,
    routeType: 'idea-task' as const,
    routing,
    parsed: fields,
    task: {
      id: result.task?.id,
      name: result.task?.name,
      url: result.task?.url,
    },
    target: result.target,
    action: 'created',
    telegramMessage: buildIdeaTelegramMessage({
      teamName: result.target?.folderName || result.target?.listName || fields.team || '-',
      taskName: result.task?.name || fields.taskTitle,
      dueDate: fields.dueDateHint || '-',
      assignee: fields.assignee || '-',
      url: result.task?.url,
    }),
    usageGuide: buildUsageGuide(),
  };

  await appendAuditLog({
    ts: new Date().toISOString(),
    routeType: 'idea-task',
    text,
    groupName,
    routing,
    parsed: fields,
    task: payload.task,
    target: result.target,
    matchedSummary: null,
    action: 'created',
    error: null,
  });

  return payload;
}

export async function logUnifiedOpsError(body: UnifiedInput, errorMessage: string) {
  const text = getInboundText(body);
  const groupName = getInboundGroupName(body);
  await appendAuditLog({
    ts: new Date().toISOString(),
    routeType: 'error',
    text,
    groupName,
    error: errorMessage,
  });
}
