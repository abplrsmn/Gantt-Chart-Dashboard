import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

type UnknownRecord = Record<string, unknown>;

type SessionItem = {
  agentId?: string;
  key?: string;
  kind?: string;
  updatedAt?: number;
  age?: number;
  totalTokens?: number | null;
  remainingTokens?: number | null;
  percentUsed?: number | null;
  model?: string;
  contextTokens?: number;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatCount(value: unknown): string {
  const n = asNumber(value, NaN);
  if (!Number.isFinite(n)) return asString(value, '0');
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function clampPercent(value: unknown): number {
  const n = asNumber(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'Unknown';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function openclawJson(method: string) {
  const env = {
    ...process.env,
    OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789',
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '',
  };

  const args = ['gateway', 'call', method, '--json'];
  if (env.OPENCLAW_GATEWAY_TOKEN) args.push('--token', env.OPENCLAW_GATEWAY_TOKEN);

  const { stdout } = await execFileAsync('openclaw', args, {
    cwd: process.cwd(),
    env,
    timeout: 10000,
    maxBuffer: 1024 * 1024 * 4,
  });

  return JSON.parse(stdout || '{}') as UnknownRecord;
}

export async function GET() {
  try {
    const [health, status] = await Promise.all([
      openclawJson('health'),
      openclawJson('status'),
    ]);

    const healthChannels = asRecord(health.channels);
    const statusSessions = asRecord(status.sessions);
    const statusHeartbeat = asRecord(status.heartbeat);
    const statusRecent = asArray<SessionItem>(statusSessions.recent);
    const byAgent = asArray<UnknownRecord>(statusSessions.byAgent);
    const heartbeatAgents = asArray(statusHeartbeat.agents);

    const agentMap = new Map<string, {
      id: string;
      name: string;
      status: string;
      model: string;
      tokens: string;
      limit: string;
      percent: number;
      updatedAt?: number;
    }>();

    for (const session of statusRecent) {
      const agentId = asString(session.agentId, 'main');
      const existing = agentMap.get(agentId);
      const updatedAt = asNumber(session.updatedAt, 0);
      if (!existing || updatedAt > (existing.updatedAt || 0)) {
        agentMap.set(agentId, {
          id: agentId,
          name: agentId === 'main' ? 'Main Agent' : agentId,
          status: asNumber(session.age, Number.MAX_SAFE_INTEGER) < 300000 ? 'Active' : 'Ready',
          model: asString(session.model, asString(asRecord(statusSessions.defaults).model, 'Unknown')),
          tokens: formatCount(session.totalTokens ?? 0),
          limit: formatCount(session.contextTokens ?? asRecord(statusSessions.defaults).contextTokens ?? 0),
          percent: clampPercent(session.percentUsed ?? 0),
          updatedAt,
        });
      }
    }

    for (const hbAgent of heartbeatAgents) {
      const record = asRecord(hbAgent);
      const agentId = asString(record.agentId);
      if (!agentId) continue;
      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
          id: agentId,
          name: agentId === 'main' ? 'Main Agent' : agentId,
          status: asString(record.enabled) === 'true' || record.enabled === true ? 'Ready' : 'Offline',
          model: asString(asRecord(statusSessions.defaults).model, 'Unknown'),
          tokens: '0',
          limit: formatCount(asRecord(statusSessions.defaults).contextTokens ?? 0),
          percent: 0,
        });
      }
    }

    const agents = Array.from(agentMap.values()).map(({ updatedAt, ...agent }) => agent);

    const totalTokens = statusRecent.reduce((sum, session) => sum + Math.max(0, asNumber(session.totalTokens, 0)), 0);
    const latestSession = [...statusRecent].sort((a, b) => asNumber(b.updatedAt, 0) - asNumber(a.updatedAt, 0))[0];
    const gatewayHost = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';

    const runningChannels = Object.values(healthChannels).filter((channel) => asRecord(channel).probe && asRecord(asRecord(channel).probe).ok === true).length;
    const channelCount = Object.keys(healthChannels).length;

    const telemetry = {
      totalTokens: formatCount(totalTokens),
      rateLimitStatus: `${channelCount > 0 ? runningChannels : 0}/${channelCount} channels healthy`,
      uptime: latestSession ? `Last activity ${formatAge(asNumber(latestSession.age, 0))}` : 'No recent sessions',
      gateway: gatewayHost,
    };

    const logs = statusRecent.slice(0, 20).map((session, index) => ({
      id: index + 1,
      time: new Date(asNumber(session.updatedAt, Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      agentId: asString(session.agentId, 'main'),
      agent: asString(session.agentId, 'main'),
      action: `${asString(session.kind, 'session')} ${asString(session.key, 'unknown-session')} · model ${asString(session.model, 'unknown')} · ${formatCount(session.totalTokens ?? 0)} tokens used`,
      type: asNumber(session.age, Number.MAX_SAFE_INTEGER) < 300000 ? 'success' as const : 'info' as const,
    }));

    return NextResponse.json({
      success: true,
      agents,
      telemetry,
      logs,
      stale: false,
      lastUpdated: new Date().toISOString(),
      source: 'openclaw gateway call health/status',
      meta: {
        sessionCount: asNumber(statusSessions.count, 0),
        agentSources: byAgent.length,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to fetch OpenClaw runtime telemetry',
        agents: [],
        telemetry: null,
        logs: [],
        stale: true,
        lastUpdated: new Date().toISOString(),
        source: 'openclaw gateway call health/status',
      },
      { status: 502 }
    );
  }
}
