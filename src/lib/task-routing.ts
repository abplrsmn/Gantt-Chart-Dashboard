export type TaskRouteSelectors = {
  spaceName?: string;
  folderName?: string;
  teamName?: string;
  listName?: string;
};

export type TaskRoutingDecision = {
  source: 'explicit-target' | 'project-default' | 'group-rule' | 'keyword-rule' | 'intent-fallback' | 'system-fallback';
  confidence: number;
  reason: string;
  selectors?: TaskRouteSelectors;
  useCapexDefault: boolean;
  ruleId?: string;
};

type RouteRule = {
  id: string;
  whenAny: string[];
  selectors?: TaskRouteSelectors;
  useCapexDefault?: boolean;
  confidence: number;
  reason: string;
};

type ResolveTaskRoutingInput = {
  text: string;
  groupName?: string | null;
  intentTeam?: string | null;
  explicitSelectors?: TaskRouteSelectors;
  hasProjectUnit?: boolean;
  isProjectCommand?: boolean;
};

const KEYWORD_RULES: RouteRule[] = [
  {
    id: 'capex-keywords',
    whenAny: ['capex', 'project |', 'unit=', 'progress=', 'bast', 'commenced', 'landscape'],
    useCapexDefault: true,
    confidence: 0.95,
    reason: 'Matched CAPEX-style project keywords',
  },
  {
    id: 'tech-keywords',
    whenAny: ['bug', 'backend', 'api', 'deploy', 'production', 'hotfix', 'server'],
    selectors: { teamName: 'tech' },
    confidence: 0.84,
    reason: 'Matched engineering/technical keywords',
  },
  {
    id: 'data-keywords',
    whenAny: ['dashboard', 'metric', 'kpi', 'etl', 'pipeline', 'data', 'report'],
    selectors: { teamName: 'data & digital' },
    confidence: 0.8,
    reason: 'Matched data/reporting keywords',
  },
  {
    id: 'finance-keywords',
    whenAny: ['invoice', 'payment', 'budget', 'reimburse', 'po', 'purchase order'],
    selectors: { teamName: 'finance' },
    confidence: 0.82,
    reason: 'Matched finance keywords',
  },
  {
    id: 'hr-keywords',
    whenAny: ['recruit', 'candidate', 'interview', 'onboarding', 'leave request', 'hr'],
    selectors: { teamName: 'hr' },
    confidence: 0.8,
    reason: 'Matched HR keywords',
  },
];

function normalizeText(input?: string | null) {
  return String(input || '').toLowerCase();
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function resolveTaskRouting(input: ResolveTaskRoutingInput): TaskRoutingDecision {
  const text = normalizeText(input.text);
  const group = normalizeText(input.groupName);
  const combined = `${text}\n${group}`;
  const explicitSelectors = input.explicitSelectors;

  if (explicitSelectors?.listName || explicitSelectors?.folderName || explicitSelectors?.spaceName) {
    return {
      source: 'explicit-target',
      confidence: 1,
      reason: 'Explicit list/folder/space selector provided in payload/command',
      selectors: explicitSelectors,
      useCapexDefault: false,
      ruleId: 'explicit-selector',
    };
  }

  if (input.isProjectCommand && (input.hasProjectUnit || containsAny(combined, ['capex', 'project', 'unit=', 'progress=']))) {
    return {
      source: 'project-default',
      confidence: 0.97,
      reason: input.hasProjectUnit
        ? 'PROJECT command with unit defaults to CAPEX routing'
        : 'PROJECT command defaults to CAPEX routing',
      useCapexDefault: true,
      ruleId: 'project-capex-default',
    };
  }

  if (containsAny(group, ['capex', 'project'])) {
    return {
      source: 'group-rule',
      confidence: 0.9,
      reason: 'Group name indicates CAPEX/project context',
      useCapexDefault: true,
      ruleId: 'group-capex',
    };
  }

  for (const rule of KEYWORD_RULES) {
    if (!containsAny(combined, rule.whenAny)) continue;
    return {
      source: 'keyword-rule',
      confidence: rule.confidence,
      reason: rule.reason,
      selectors: rule.selectors,
      useCapexDefault: !!rule.useCapexDefault,
      ruleId: rule.id,
    };
  }

  const intentTeam = String(input.intentTeam || '').trim();
  if (intentTeam) {
    return {
      source: 'intent-fallback',
      confidence: 0.7,
      reason: 'Using team inferred from parsed intent/group hint',
      selectors: { teamName: intentTeam },
      useCapexDefault: false,
      ruleId: 'intent-team-fallback',
    };
  }

  return {
    source: 'system-fallback',
    confidence: 0.5,
    reason: 'No explicit or keyword match; fallback to tech team',
    selectors: { teamName: 'tech' },
    useCapexDefault: false,
    ruleId: 'system-tech-fallback',
  };
}
