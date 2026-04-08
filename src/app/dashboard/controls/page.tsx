"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bot, Cpu, Database, Server, Terminal, Zap, RefreshCw, WifiOff } from "lucide-react";

type AgentData = {
  id: string;
  name: string;
  status: string;
  model: string;
  tokens: string;
  limit: string;
  percent: number;
};

type LogEntry = {
  id: number;
  time: string;
  agentId?: string;
  agent: string;
  action: string;
  type: 'success' | 'info' | 'warning';
};

type TelemetrySummary = {
  totalTokens: string;
  rateLimitStatus: string;
  uptime: string;
  gateway: string;
};

type TelemetryResponse = {
  success: boolean;
  error?: string;
  agents?: AgentData[];
  telemetry?: TelemetrySummary | null;
  logs?: LogEntry[];
  stale?: boolean;
  lastUpdated?: string;
  source?: string;
};

const EMPTY_TELEMETRY: TelemetrySummary = {
  totalTokens: '0',
  rateLimitStatus: 'Unknown',
  uptime: 'Unknown',
  gateway: 'Unavailable',
};

const POLL_INTERVAL_MS = 10000;

function getAgentStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "processing", "busy", "running"].includes(normalized)) {
    return {
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
      dot: 'bg-amber-500 animate-pulse',
      label: status,
    };
  }

  if (["offline", "disconnected", "down"].includes(normalized)) {
    return {
      badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      dot: 'bg-red-500',
      label: status,
    };
  }

  return {
    badge: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    dot: 'bg-green-500',
    label: status,
  };
}

export default function ControlsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary>(EMPTY_TELEMETRY);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ai-telemetry', { cache: 'no-store' });
      const data = (await res.json()) as TelemetryResponse;

      setAgents(data.agents ?? []);
      setTelemetry(data.telemetry ?? EMPTY_TELEMETRY);
      setLogs(data.logs ?? []);
      setLastUpdated(data.lastUpdated ?? null);
      setStale(Boolean(data.stale));

      if (data.success) {
        setError("");
      } else {
        setError(data.error || 'Failed to fetch telemetry data');
      }
    } catch (err: unknown) {
      setAgents([]);
      setTelemetry(EMPTY_TELEMETRY);
      setLogs([]);
      setStale(true);
      setError(err instanceof Error ? err.message : "Failed to fetch telemetry data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const id = setInterval(fetchTelemetry, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const activeAgents = useMemo(() => {
    return agents.filter((a) => !['offline', 'disconnected', 'down'].includes(a.status.toLowerCase())).length;
  }, [agents]);

  const selectedAgentName = useMemo(() => {
    return agents.find((a) => a.id === selectedAgent)?.name;
  }, [agents, selectedAgent]);

  const displayLogs = useMemo(() => {
    if (!selectedAgent) return [];

    return logs.filter((log) => {
      if (log.agentId) return log.agentId === selectedAgent;
      return log.agent.toLowerCase().includes(selectedAgent.toLowerCase());
    });
  }, [logs, selectedAgent]);

  const freshnessText = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="text-blue-500" size={24} />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">AI Mission Control</h2>
        </div>
        <div className="flex items-center gap-3">
          {error ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg text-xs font-medium text-red-700 dark:text-red-400">
              <WifiOff size={14} /> {stale ? 'Telemetry Stale' : 'Connection Error'}
            </div>
          ) : (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${stale ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400'}`}>
              <span className={`w-2 h-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`}></span>
              {stale ? 'Using Last Known State' : 'Live Sync Active'}
            </div>
          )}
          <button
            onClick={fetchTelemetry}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Force Sync
          </button>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
        Last update: <span className="font-semibold">{freshnessText}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
          <div className="flex items-center gap-2 mb-2">
            <Bot className="text-blue-500" size={16} />
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Active Agents</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{activeAgents}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1">{agents.length} detected</p>
        </div>

        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl" />
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="text-purple-500" size={16} />
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Token Usage</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{telemetry.totalTokens}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1">Real-time telemetry</p>
        </div>

        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-green-500 to-emerald-500 rounded-t-2xl" />
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-green-500" size={16} />
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Rate Limits</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{telemetry.rateLimitStatus}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1">Gateway reported</p>
        </div>

        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-orange-500 to-amber-500 rounded-t-2xl" />
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-orange-500" size={16} />
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Gateway</p>
          </div>
          <p className="text-lg font-bold text-slate-800 dark:text-white mt-1 truncate">{telemetry.uptime}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1 break-all">{telemetry.gateway}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="glass-card p-5 lg:col-span-1 flex flex-col h-[400px]">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Database size={16} className="text-blue-500" />
            Agent Subsystems
          </h3>
          <p className="text-xs text-slate-500 mb-4">Click an agent to view its specific telemetry feed.</p>

          <div className="space-y-4 overflow-y-auto pr-2 flex-1 custom-scrollbar">
            {agents.length > 0 ? agents.map(agent => {
              const isSelected = selectedAgent === agent.id;
              const tone = getAgentStatusTone(agent.status);

              return (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-400 shadow-md ring-1 ring-blue-400/50'
                      : 'bg-white/50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/50 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3 gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-slate-800 dark:text-gray-100 block truncate">{agent.name}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold tracking-wider mt-1.5 inline-block bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 max-w-full truncate">
                        {agent.model || 'Unknown model'}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full ${tone.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></span>
                      {tone.label}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="flex justify-between text-[10px] mb-1.5 gap-2">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Database size={10} /> Context Usage
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{agent.tokens} / {agent.limit}</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-1000 ${
                          agent.status.toLowerCase() === 'offline' ? 'bg-red-500/50' :
                          agent.percent > 80 ? 'bg-orange-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(agent.percent, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="flex justify-center py-12 text-xs text-slate-500 dark:text-slate-400">
                {loading ? <RefreshCw size={24} className="text-blue-500 animate-spin" /> : 'No agents reported by telemetry source.'}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-0 lg:col-span-2 overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700/50 h-[400px]">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/40 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Terminal size={16} className="text-slate-500" />
              Live Telemetry Feed
              {selectedAgent && selectedAgentName && (
                <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  Filtering: {selectedAgentName}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              {selectedAgent && (
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  Clear Filter
                </button>
              )}
              <span className="text-[10px] font-bold tracking-widest text-slate-400 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1 rounded-md shadow-sm border border-slate-200 dark:border-slate-800">
                <span className={`w-1.5 h-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}></span>
                {stale ? 'STALE' : 'LIVE'}
              </span>
            </div>
          </div>

          <div className="p-5 font-mono text-[12px] leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-[#0f172a] flex-1 overflow-auto h-full custom-scrollbar">
            {!selectedAgent ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 space-y-4">
                <Bot size={48} className="opacity-20" />
                <p className="text-sm tracking-wide">Choose an agent on the left to view its telemetry feed.</p>
              </div>
            ) : displayLogs.length > 0 ? (
              <div className="space-y-3">
                <p className="text-emerald-600 dark:text-emerald-400 mb-6">--- Telemetry stream for {selectedAgentName} ---</p>
                {displayLogs.map(log => (
                  <div key={log.id} className="flex gap-3 py-1">
                    <span className="text-blue-600 dark:text-blue-400 shrink-0">[{log.time}]</span>
                    <span className="text-slate-700 dark:text-slate-300">{log.action}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
                <p>No telemetry feed entries for this agent yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
