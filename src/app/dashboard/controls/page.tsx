"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, Cpu, Database, Server, Terminal,
  RefreshCw, WifiOff, DollarSign, Clock, Wifi,
} from "lucide-react";
import ThreeOffice from "@/components/dashboard/ThreeOffice";

// ─── Types ────────────────────────────────────────────────────────────────────
type AgentData = {
  id: string;
  name: string;
  status: string;
  model: string;
  tokens: string;
  limit: string;
  percent: number;
  costFmt: string;
  lastSeen: string;
};

type ConfigAgent = {
  id: string;
  name: string;
  isDefault?: boolean;
  heartbeatEnabled?: boolean;
  heartbeatEvery?: string;
  model?: string;
};

type ModelBreakdown = {
  model: string;
  label: string;
  tokens: string;
  tokensRaw: number;
  costFmt: string;
  costUsd: number;
};

type TelemetrySummary = {
  totalTokens: string;
  totalTokensRaw: number;
  totalCostUsd: number;
  totalCostFmt: string;
  rateLimitStatus: string;
  uptime: string;
  gateway: string;
  gatewayOk: boolean;
  eventLoopDegraded?: boolean;
  tasks?: { total: number; active: number; failures: number };
  modelBreakdown: ModelBreakdown[];
};

type LogEntry = {
  id: number;
  time: string;
  agentId?: string;
  agent: string;
  action: string;
  type: 'success' | 'info' | 'warning';
};

type TelemetryResponse = {
  success: boolean;
  error?: string;
  agents?: AgentData[];
  configuredAgents?: ConfigAgent[];
  telemetry?: TelemetrySummary | null;
  logs?: LogEntry[];
  stale?: boolean;
  lastUpdated?: string;
  source?: string;
};

const EMPTY_TELEMETRY: TelemetrySummary = {
  totalTokens: '0',
  totalTokensRaw: 0,
  totalCostUsd: 0,
  totalCostFmt: '$0.0000',
  rateLimitStatus: '—',
  uptime: '—',
  gateway: '—',
  gatewayOk: false,
  modelBreakdown: [],
};

const POLL_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function agentTone(status: string) {
  const s = status.toLowerCase();
  if (["active", "processing", "busy", "running"].includes(s))
    return { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400', dot: 'bg-amber-500 animate-pulse', label: status };
  if (["offline", "disconnected", "down"].includes(s))
    return { badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400', dot: 'bg-red-500', label: status };
  return { badge: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500', label: status };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, iconColor, label, value, sub,
}: {
  icon: React.ElementType; iconColor: string; label: string; value: string; sub: string;
}) {
  return (
    <div className="glass-card p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={iconColor} size={15} />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-white mt-1 truncate">{value}</p>
      <p className="text-[10px] font-medium text-slate-400 mt-1 truncate">{sub}</p>
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ControlsPage() {
  const [agents,      setAgents]      = useState<AgentData[]>([]);
  const [configuredAgents, setConfiguredAgents] = useState<ConfigAgent[]>([]);
  const [telemetry,   setTelemetry]   = useState<TelemetrySummary>(EMPTY_TELEMETRY);
  const [logs,        setLogs]        = useState<LogEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale,       setStale]       = useState(false);
  const [source,      setSource]      = useState("");

  const fetchTelemetry = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res  = await fetch('/api/ai-telemetry', { cache: 'no-store' });
      const data = (await res.json()) as TelemetryResponse;
      setAgents(data.agents ?? []);
      setConfiguredAgents(data.configuredAgents ?? []);
      setTelemetry(data.telemetry ?? EMPTY_TELEMETRY);
      setLogs(data.logs ?? []);
      setLastUpdated(data.lastUpdated ?? null);
      setStale(Boolean(data.stale));
      setSource(data.source ?? '');
      setError(data.success ? '' : (data.error ?? 'Failed to fetch telemetry'));
    } catch (err: unknown) {
      setAgents([]);
      setConfiguredAgents([]);
      setTelemetry(EMPTY_TELEMETRY);
      setLogs([]);
      setStale(true);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry(true);
    const id = setInterval(() => fetchTelemetry(false), POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSessions = useMemo(
    () => agents.filter(a => ['active', 'processing', 'busy', 'running'].includes(a.status.toLowerCase())).length,
    [agents]
  );

  const selectedAgentName = useMemo(
    () => agents.find(a => a.id === selectedAgent)?.name,
    [agents, selectedAgent]
  );

  const displayLogs = useMemo(() => {
    if (!selectedAgent) return logs;
    return logs.filter(l => l.agentId === selectedAgent || l.agent.toLowerCase().includes(selectedAgent.toLowerCase()));
  }, [logs, selectedAgent]);

  const freshnessText = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  const isConnected = !error && !stale;

  return (
    <div className="space-y-5 pb-6 animate-page-enter">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="text-blue-500" size={20} />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">AI Mission Control</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          {error ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400">
              <WifiOff size={12} /> {stale ? 'Stale' : 'Offline'}
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              stale
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400'
                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-600 dark:text-green-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
              {stale ? 'Last Known' : 'Live'}
            </div>
          )}
          <button
            onClick={() => fetchTelemetry(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-card text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Sync
          </button>
        </div>
      </div>

      {/* ── Meta row ── */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400 -mt-1">
        <span className="flex items-center gap-1"><Clock size={10} /> Updated: <span className="font-semibold text-slate-500">{freshnessText}</span></span>
        {source && <span className="flex items-center gap-1"><Wifi size={10} /> via <span className="font-semibold text-slate-500">{source}</span></span>}
        {error && <span className="text-red-400 font-medium truncate max-w-xs">{error}</span>}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Bot} iconColor="text-blue-500"
          label="Active Sessions"
          value={String(activeSessions)}
          sub={`${agents.length} real sessions detected`}
        />
        <StatCard
          icon={Cpu} iconColor="text-purple-500"
          label="Total Tokens"
          value={telemetry.totalTokens}
          sub="across all sessions"
        />
        <StatCard
          icon={DollarSign} iconColor="text-emerald-500"
          label="Est. Cost"
          value={telemetry.totalCostFmt}
          sub="based on model pricing"
        />
        <StatCard
          icon={isConnected ? Activity : WifiOff}
          iconColor={isConnected ? 'text-orange-500' : 'text-red-400'}
          label="Gateway"
          value={telemetry.gatewayOk ? 'Online' : (isConnected ? 'Checking' : 'Offline')}
          sub={telemetry.gateway}
        />
      </div>

      <div className="glass-card p-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-cyan-500" />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">OpenClaw 3D Office</h3>
          </div>
          <div className="flex flex-wrap justify-end gap-2 text-[10px] font-semibold">
            <span className="px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-200/70 dark:border-blue-400/20">{configuredAgents.length || agents.length} configured agents</span>
            <span className="px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-200/70 dark:border-amber-400/20">{activeSessions} active sessions</span>
          </div>
        </div>
        <ThreeOffice agents={agents} configuredAgents={configuredAgents} gatewayOk={telemetry.gatewayOk} />
      </div>

      {/* ── Agents + Feed ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Agent list */}
        <div className="glass-card p-4 lg:col-span-1 flex flex-col" style={{ minHeight: '420px', maxHeight: '520px' }}>
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Database size={13} className="text-blue-500" />
            Session Telemetry
          </h3>
          <p className="text-[10px] text-slate-400 mb-3">Real OpenClaw sessions only. Click a session to filter the log.</p>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {agents.length === 0 ? (
              <div className="flex justify-center py-12">
                {loading
                  ? <RefreshCw size={20} className="text-blue-500 animate-spin" />
                  : <p className="text-xs text-slate-400">No session telemetry reported.</p>
                }
              </div>
            ) : agents.map(agent => {
              const isSelected = selectedAgent === agent.id;
              const tone = agentTone(agent.status);
              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-400/70 ring-1 ring-blue-400/30'
                      : 'bg-white/50 dark:bg-white/3 border-slate-200/60 dark:border-white/8 hover:border-blue-300/60 dark:hover:border-blue-500/30'
                  }`}
                >
                  {/* Name + status */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block truncate">{agent.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 inline-block mt-1 max-w-full truncate">
                        {agent.model || 'Unknown model'}
                      </span>
                    </div>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${tone.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                      {tone.label}
                    </span>
                  </div>

                  {/* Token bar */}
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/6">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-400 flex items-center gap-1"><Cpu size={9} /> Context</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{agent.tokens} / {agent.limit}</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-white/8 rounded-full h-1 overflow-hidden">
                      <div
                        className={`h-1 rounded-full transition-all ${
                          agent.status.toLowerCase() === 'offline' ? 'bg-red-400/50' :
                          agent.percent > 80 ? 'bg-orange-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(agent.percent, 1)}%` }}
                      />
                    </div>
                  </div>

                  {/* Cost + last seen */}
                  <div className="flex justify-between items-center mt-2 text-[10px]">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                      <DollarSign size={9} /> {agent.costFmt}
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock size={9} /> {agent.lastSeen}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live feed */}
        <div className="glass-card p-0 lg:col-span-2 overflow-hidden flex flex-col" style={{ minHeight: '420px', maxHeight: '520px' }}>
          {/* Feed header */}
          <div className="px-4 py-3 border-b border-slate-200/60 dark:border-white/8 bg-slate-50/80 dark:bg-white/3 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <Terminal size={13} className="text-slate-400" />
              Live Telemetry Feed
              {selectedAgent && selectedAgentName && (
                <span className="ml-1 text-[10px] font-semibold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-full">
                  {selectedAgentName}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {selectedAgent && (
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Clear filter
                </button>
              )}
              <span className={`text-[9px] font-bold tracking-widest px-2 py-1 rounded border flex items-center gap-1 ${
                stale
                  ? 'text-amber-500 border-amber-300/50 bg-amber-50 dark:bg-amber-500/10'
                  : 'text-red-500 border-red-300/50 bg-red-50 dark:bg-red-500/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                {stale ? 'STALE' : 'LIVE'}
              </span>
            </div>
          </div>

          {/* Feed body */}
          <div className="font-mono text-[11px] leading-relaxed flex-1 overflow-auto p-4 bg-slate-50/50 dark:bg-[#0f172a]">
            {displayLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <Bot size={36} className="opacity-20" />
                <p className="text-xs">
                  {selectedAgent
                    ? `No log entries for ${selectedAgentName}.`
                    : agents.length === 0
                    ? 'No session data available. Gateway may be offline.'
                    : 'Select a session to filter, or waiting for telemetry data...'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedAgent && (
                  <p className="text-emerald-600 dark:text-emerald-400 mb-3 text-[10px]">
                    --- stream: {selectedAgentName} ---
                  </p>
                )}
                {displayLogs.map(log => (
                  <div key={log.id} className="flex gap-2 py-0.5">
                    <span className="text-blue-500 dark:text-blue-400 shrink-0 text-[10px]">[{log.time}]</span>
                    <span className={`${log.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'} break-all`}>
                      {log.action}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
}
