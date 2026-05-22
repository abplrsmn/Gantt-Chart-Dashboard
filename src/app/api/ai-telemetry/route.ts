import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

// ─── Pricing (USD per 1M tokens; use input/output when available) ────────────
type ModelPrice = { inputPer1M: number; outputPer1M: number; label: string };
const MODEL_PRICING: Record<string, ModelPrice> = {
  // GPT-5.5 pricing is kept as the existing blended estimate until the provider
  // exposes exact input/output billing through telemetry.
  'gpt-5.5':           { inputPer1M: 37.50, outputPer1M: 37.50, label: 'GPT-5.5' },
  'gpt-5.4-mini':      { inputPer1M: 0.15,  outputPer1M: 0.60,  label: 'GPT-5.4 mini' },
  'o3':                { inputPer1M: 10.00, outputPer1M: 40.00, label: 'o3' },
  'o4-mini':           { inputPer1M: 1.10,  outputPer1M: 4.40,  label: 'o4-mini' },
  'gpt-4o':            { inputPer1M: 2.50,  outputPer1M: 10.00, label: 'GPT-4o' },
  'gpt-4o-mini':       { inputPer1M: 0.15,  outputPer1M: 0.60,  label: 'GPT-4o mini' },
  'gpt-4-turbo':       { inputPer1M: 10.00, outputPer1M: 30.00, label: 'GPT-4 Turbo' },
  'gpt-3.5-turbo':     { inputPer1M: 0.50,  outputPer1M: 1.50,  label: 'GPT-3.5 Turbo' },
  'claude-3-5-sonnet': { inputPer1M: 3.00,  outputPer1M: 15.00, label: 'Claude 3.5 Sonnet' },
  'claude-3-5-haiku':  { inputPer1M: 0.25,  outputPer1M: 1.25,  label: 'Claude 3.5 Haiku' },
  'claude-3-opus':     { inputPer1M: 15.00, outputPer1M: 75.00, label: 'Claude 3 Opus' },
  'deepseek-r1':       { inputPer1M: 0.55,  outputPer1M: 2.19,  label: 'DeepSeek R1' },
};

function pricingFor(model: string): ModelPrice {
  const lower = model.toLowerCase();
  for (const [key, val] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key)) return val;
  }
  return { inputPer1M: 2.50, outputPer1M: 7.50, label: model };
}

function calcCostFromParts(inputTokens: number, outputTokens: number, model: string) {
  const p = pricingFor(model);
  return (inputTokens / 1_000_000) * p.inputPer1M + (outputTokens / 1_000_000) * p.outputPer1M;
}

function calcCost(tokens: number, model: string) {
  const p = pricingFor(model);
  const blended = (p.inputPer1M + p.outputPer1M) / 2;
  return (tokens / 1_000_000) * blended;
}

function fmtCost(usd: number) {
  if (usd < 0.0001) return '$0.0000';
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
type U = Record<string, unknown>;
const asRec = (v: unknown): U => (v && typeof v === 'object' && !Array.isArray(v) ? (v as U) : {});
const asArr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asStr = (v: unknown, fb = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fb);
const asNum = (v: unknown, fb = 0) => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fb;
};

function fmtCount(v: unknown) {
  const n = asNum(v, NaN);
  if (!Number.isFinite(n)) return asStr(v, '0');
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtAge(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return 'Unknown';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── HTTP: only /health (returns JSON) ───────────────────────────────────────
const GATEWAY_URL   = process.env.OPENCLAW_GATEWAY_URL  || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '';

async function httpHealth(): Promise<U> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (GATEWAY_TOKEN) headers.Authorization = `Bearer ${GATEWAY_TOKEN}`;
  const res = await fetch(`${GATEWAY_URL}/health`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`/health HTTP ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== 'object' || !('ok' in json)) throw new Error('/health: not a JSON health response');
  return json as U;
}

// ─── CLI: openclaw sessions --json / gateway call health --json ───────────────
const OPENCLAW_CANDIDATES = [
  process.env.OPENCLAW_BIN,
  '/usr/bin/openclaw',
  '/usr/local/bin/openclaw',
  '/home/ahgadmin/.local/bin/openclaw',
  'openclaw',
].filter(Boolean) as string[];

const CLI_ENV = {
  ...process.env,
  PATH: `/usr/bin:/usr/local/bin:/home/ahgadmin/.local/bin:/bin:${process.env.PATH ?? ''}`,
  OPENCLAW_GATEWAY_URL: GATEWAY_URL,
  ...(GATEWAY_TOKEN ? { OPENCLAW_GATEWAY_TOKEN: GATEWAY_TOKEN } : {}),
};

async function runCli(args: string[]): Promise<U> {
  for (const bin of OPENCLAW_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(bin, args, {
        env: CLI_ENV,
        timeout: 12_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const trimmed = stdout.trim();
      if (!trimmed) throw new Error('empty stdout');
      return JSON.parse(trimmed) as U;
    } catch { /* try next */ }
  }
  throw new Error(`CLI failed: openclaw ${args.join(' ')}`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function GET() {
  const errors: string[] = [];
  let health: U = {};
  let sessions: U = {};
  let via: string[] = [];

  // 1. Get health (HTTP first, CLI fallback)
  try {
    health = await httpHealth();
    via.push('HTTP /health');
  } catch (e) {
    errors.push(`HTTP health: ${e instanceof Error ? e.message : e}`);
    try {
      health = await runCli(['gateway', 'call', 'health', '--json']);
      via.push('CLI gateway call health');
    } catch (e2) {
      errors.push(`CLI health: ${e2 instanceof Error ? e2.message : e2}`);
    }
  }

  // 2. Get sessions (CLI only — /status returns HTML)
  try {
    sessions = await runCli(['sessions', '--json']);
    via.push('CLI sessions');
  } catch (e) {
    errors.push(`CLI sessions: ${e instanceof Error ? e.message : e}`);
    // fallback: try gateway call status
    try {
      sessions = await runCli(['gateway', 'call', 'status', '--json']);
      via.push('CLI gateway call status');
    } catch (e2) {
      errors.push(`CLI status: ${e2 instanceof Error ? e2.message : e2}`);
    }
  }

  const gotAny = Object.keys(health).length > 0 || Object.keys(sessions).length > 0;
  if (!gotAny) {
    return NextResponse.json({
      success: false,
      error: errors.join(' | '),
      agents: [], telemetry: null, logs: [],
      stale: true,
      lastUpdated: new Date().toISOString(),
      source: 'all methods failed',
    }, { status: 502 });
  }

  // ── Parse health ──────────────────────────────────────────────────────────
  const channels = asRec(health.channels);
  const runningChannels = Object.values(channels)
    .filter(ch => asRec(asRec(ch).probe).ok === true).length;
  const channelCount = Object.keys(channels).length;
  const eventLoop = asRec(health.eventLoop);
  const gatewayOk = health.ok === true;

  // ── Parse sessions ────────────────────────────────────────────────────────
  // `openclaw sessions --json` returns a top-level `sessions: []` array.
  // Older/status payloads may return `sessions.recent: []` instead.
  const heartbeat = asRec(health);
  const hbAgents  = asArr<U>(heartbeat.agents);
  const tasks     = asRec(sessions.tasks);
  const rawSessions = (sessions as U).sessions;
  const statusSessions = Array.isArray(rawSessions) ? {} : asRec(rawSessions);
  const statusRecent = (Array.isArray(rawSessions)
    ? asArr<U>(rawSessions)
    : asArr<U>(statusSessions.recent))
    // Hide legacy GPT-5.4 sessions from the live controls surface. They are
    // historical session metadata, not models currently in use.
    .filter(s => !asStr(s.model).toLowerCase().includes('gpt-5.4'));

  const agentMap = new Map<string, {
    id: string; name: string; status: string; model: string;
    tokens: string; tokenCount: number; limit: string; percent: number;
    costFmt: string; costUsd: number; lastSeen: string; updatedAt: number;
  }>();

  // From recent sessions (if available). Key each row by the real session key,
  // not only agentId, otherwise multiple chats collapse into one made-up row.
  for (const s of statusRecent) {
    const sessionKey = asStr(s.key, asStr(s.sessionId, asStr(s.agentId, 'session')));
    const agentId = asStr(s.agentId, 'main');
    const kind = asStr(s.kind, 'session');
    const updatedAt = asNum(s.updatedAt, 0);
    const tokenCount = Math.max(0, asNum(s.totalTokens, 0));
    const inputTokens = Math.max(0, asNum(s.inputTokens, 0));
    const outputTokens = Math.max(0, asNum(s.outputTokens, 0));
    const model = asStr(s.model, asStr(asRec(statusSessions.defaults).model, 'unknown'));
    const age = asNum(s.ageMs ?? s.age, Infinity);
    const contextTokens = asNum(s.contextTokens ?? asRec(statusSessions.defaults).contextTokens, 0);
    const percentUsed = contextTokens > 0 ? (tokenCount / contextTokens) * 100 : asNum(s.percentUsed, 0);

    agentMap.set(sessionKey, {
      id: sessionKey,
      name: kind === 'group' ? 'Group Session' : kind === 'direct' ? 'Direct Session' : kind === 'cron' ? 'Cron Session' : `${agentId} Session`,
      status: age < 300_000 ? 'Active' : 'Ready',
      model,
      tokens: fmtCount(tokenCount),
      tokenCount,
      limit: contextTokens > 0 ? fmtCount(contextTokens) : '—',
      percent: Math.min(100, Math.max(0, Math.round(percentUsed))),
      // Keep estimated cost aligned with the displayed session token count.
      // Some OpenClaw telemetry exposes lifetime provider input/output counters that
      // can be much larger than this session's retained context tokens, which made
      // the dashboard look like a real billing invoice. This is only a rough usage
      // value for the visible session telemetry, not provider billing.
      costFmt: fmtCost(calcCost(tokenCount, model)),
      costUsd: calcCost(tokenCount, model),
      lastSeen: fmtAge(age),
      updatedAt,
    });
  }

  // From heartbeat agents only if session data is unavailable.
  const defaultModel = asStr(asRec(statusSessions.defaults).model, 'openai-codex/gpt-5.5');
  if (agentMap.size === 0) {
    for (const hb of hbAgents) {
      const agentId = asStr(hb.agentId);
      if (!agentId) continue;
      const enabled = asRec(hb.heartbeat).enabled === true || hb.enabled === true;
      agentMap.set(`heartbeat:${agentId}`, {
        id: `heartbeat:${agentId}`,
        name: agentId === 'main' ? 'Main Agent' : agentId,
        status: enabled ? 'Ready' : 'Offline',
        model: defaultModel,
        tokens: '—', tokenCount: 0,
        limit: '—', percent: 0,
        costFmt: '$0.0000', costUsd: 0,
        lastSeen: 'No session telemetry', updatedAt: 0,
      });
    }
  }

  const agents = Array.from(agentMap.values()).map(({ updatedAt, tokenCount, ...a }) => a);
  const configuredAgents = hbAgents.map((hb) => {
    const agentId = asStr(hb.agentId);
    const heartbeat = asRec(hb.heartbeat);
    return {
      id: agentId,
      name: agentId === 'main' ? 'Main Agent' : agentId,
      isDefault: hb.isDefault === true,
      heartbeatEnabled: heartbeat.enabled === true,
      heartbeatEvery: asStr(heartbeat.every, ''),
      model: asStr(heartbeat.model, defaultModel),
    };
  }).filter(a => a.id);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalTokensRaw = Array.from(agentMap.values()).reduce((s, a) => s + a.tokenCount, 0);
  const totalCostUsd   = Array.from(agentMap.values()).reduce((s, a) => s + a.costUsd, 0);

  // Per-model breakdown
  const modelMap: Record<string, { tokens: number; costUsd: number; label: string }> = {};
  for (const s of statusRecent) {
    const model = asStr(s.model, defaultModel);
    const tokens = Math.max(0, asNum(s.totalTokens, 0));
    const cost = calcCost(tokens, model);
    const { label } = pricingFor(model);
    if (!modelMap[model]) modelMap[model] = { tokens: 0, costUsd: 0, label };
    modelMap[model].tokens += tokens;
    modelMap[model].costUsd += cost;
  }
  // If no session data, show current model from config
  if (Object.keys(modelMap).length === 0) {
    modelMap[defaultModel] = { tokens: 0, costUsd: 0, label: pricingFor(defaultModel).label };
  }

  const telemetry = {
    totalTokens: fmtCount(totalTokensRaw),
    totalTokensRaw,
    totalCostUsd,
    totalCostFmt: fmtCost(totalCostUsd),
    rateLimitStatus: channelCount > 0 ? `${runningChannels}/${channelCount} channels` : '—',
    uptime: health.status === 'live' ? 'Live' : 'Unknown',
    gateway: GATEWAY_URL,
    gatewayOk,
    eventLoopDegraded: eventLoop.degraded === true,
    tasks: {
      total: asNum(tasks.total, 0),
      active: asNum(tasks.active, 0),
      failures: asNum(tasks.failures, 0),
    },
    modelBreakdown: Object.entries(modelMap).map(([model, d]) => ({
      model, label: d.label,
      tokens: fmtCount(d.tokens), tokensRaw: d.tokens,
      costFmt: fmtCost(d.costUsd), costUsd: d.costUsd,
    })),
  };

  const logs = statusRecent.slice(0, 30).map((s, i) => {
    const model  = asStr(s.model, defaultModel);
    const tokens = Math.max(0, asNum(s.totalTokens, 0));
    const sessionKey = asStr(s.key, '?');
    return {
      id: i + 1,
      time: new Date(asNum(s.updatedAt, Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      agentId: sessionKey,
      agent:   sessionKey,
      action:  `${asStr(s.kind, 'session')} ${sessionKey} · ${pricingFor(model).label} · ${fmtCount(tokens)} tokens · ${fmtCost(calcCost(tokens, model))} est. usage`,
      type:    asNum(s.ageMs ?? s.age, Infinity) < 300_000 ? 'success' as const : 'info' as const,
    };
  });

  return NextResponse.json({
    success: true,
    agents,
    configuredAgents,
    telemetry,
    logs,
    stale: false,
    lastUpdated: new Date().toISOString(),
    source: via.join(' + '),
    meta: { errors: errors.length > 0 ? errors : undefined },
  });
}
