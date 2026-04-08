"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Filter,
  RefreshCcw,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";
import { differenceInCalendarDays, format, isValid, parse } from "date-fns";

type CapexProject = {
  id: string;
  unit: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  url?: string;
  source?: 'clickup' | 'seed';
};

type CapexMappingRow = {
  no: number;
  clickupTaskId: string | null;
  clickupTaskName?: string | null;
};

const parseFlexibleDate = (value?: string) => {
  if (!value) return null;
  const formats = ["d MMM yyyy", "d MMMM yyyy", "d-MMM-yyyy", "d-MMMM-yyyy"];
  for (const fmt of formats) {
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
};

const getStatusTone = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("done")) {
    if (s.includes("pending")) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20";
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  }
  if (s.includes("on schedule")) return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20";
  if (s.includes("ongoing")) return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/20";
  if (s.includes("commenced")) return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/20";
  return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20";
};

const getHealth = (project: CapexProject) => {
  const s = project.status.toLowerCase();
  if (s.includes("ongoing") && !project.end) return "At Risk";
  if (project.name.toLowerCase().includes("ppr pipe") && project.end && parseFlexibleDate(project.end) && parseFlexibleDate(project.start) && parseFlexibleDate(project.end)!.getFullYear() < parseFlexibleDate(project.start)!.getFullYear()) return "At Risk";
  if (s.includes("pending")) return "Needs Closure";
  if (s.includes("done")) return "Done";
  if (s.includes("on schedule")) return "On Track";
  if (s.includes("commenced") && (project.progress ?? 0) === 0) return "Watch";
  return "Monitor";
};

const getRiskReason = (project: CapexProject) => {
  const health = getHealth(project);
  if (health === "At Risk" && !project.end) return "No end date / prolonged open project";
  if (project.name.toLowerCase().includes("ppr pipe")) return "Date anomaly in source data";
  if (health === "Needs Closure") return "Work done but closure item remains open";
  if (health === "Watch") return "Started but progress still 0%";
  if (health === "On Track") return "Monitor execution pace";
  return "Routine monitoring";
};

function getDuration(project: CapexProject) {
  const startDate = parseFlexibleDate(project.start);
  const endDate = parseFlexibleDate(project.end);
  if (startDate && endDate) return differenceInCalendarDays(endDate, startDate);
  return null;
}

function getDaysToEnd(project: CapexProject) {
  const endDate = parseFlexibleDate(project.end);
  if (!endDate) return null;
  return differenceInCalendarDays(endDate, new Date());
}

export default function CapexGanttMonitor() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [projects, setProjects] = useState<CapexProject[]>([]);
  const [mappingRows, setMappingRows] = useState<CapexMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        setLoading(true);
        setLoadError(null);
        const [projectsRes, mappingRes] = await Promise.all([
          fetch('/api/capex/projects', { cache: 'no-store' }),
          fetch('/api/capex/mapping', { cache: 'no-store' }),
        ]);
        const projectsJson = await projectsRes.json();
        const mappingJson = await mappingRes.json();
        if (!active) return;

        if (mappingJson?.success && Array.isArray(mappingJson.data)) {
          setMappingRows(mappingJson.data);
        }

        if (projectsJson?.success && Array.isArray(projectsJson.data) && projectsJson.data.length > 0) {
          setProjects(projectsJson.data);
          setSelectedProjectId(String(projectsJson.data[0].id));
        } else {
          setProjects([]);
          if (!projectsJson?.success && projectsJson?.error) setLoadError(String(projectsJson.error));
          else if (mappingJson?.success && Array.isArray(mappingJson.data) && mappingJson.data.length === 0) setLoadError('mapping.json empty');
        }
      } catch (error: any) {
        if (!active) return;
        setProjects([]);
        setLoadError(error?.message || 'Failed to load CAPEX projects');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const done = projects.filter((p) => getHealth(p) === "Done").length;
    const onTrack = projects.filter((p) => getHealth(p) === "On Track").length;
    const atRisk = projects.filter((p) => getHealth(p) === "At Risk").length;
    const watch = projects.filter((p) => getHealth(p) === "Watch").length;
    const dueSoon = projects.filter((p) => {
      const days = getDaysToEnd(p);
      return days !== null && days >= 0 && days <= 14 && getHealth(p) !== "Done";
    }).length;
    return { total: projects.length, done, onTrack, atRisk, watch, dueSoon };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch = `${project.unit} ${project.name} ${project.status} ${project.pic ?? ""}`.toLowerCase().includes(search.toLowerCase());
      const health = getHealth(project);
      const matchesStatus = statusFilter === "All" || health === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  const selectedProject = useMemo(() => {
    return filteredProjects.find((p) => p.id === selectedProjectId) || filteredProjects[0] || projects[0];
  }, [projects, filteredProjects, selectedProjectId]);

  const atRiskProjects = useMemo(() => projects.filter((p) => ["At Risk", "Needs Closure", "Watch"].includes(getHealth(p))), [projects]);
  const dueSoonProjects = useMemo(() => projects.filter((p) => {
    const days = getDaysToEnd(p);
    return days !== null && days >= 0 && days <= 14 && getHealth(p) !== "Done";
  }), [projects]);

  const unresolvedCount = mappingRows.filter((row) => !row.clickupTaskId).length;
  const statusOptions = ["All", "Done", "On Track", "Watch", "At Risk", "Needs Closure", "Monitor"];

  return (
    <div className="space-y-5">
      <section className="glass-card p-5 space-y-5 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 rounded-t-2xl"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-full flex-shrink-0"></div>
              <CalendarRange size={14} className="text-cyan-500" />
              <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">CAPEX Gantt Monitor</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simple gantt view from ClickUp tasks.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${loading ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                {loading ? 'Syncing ClickUp...' : 'Live source: ClickUp'}
              </span>
              <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${unresolvedCount > 0 ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                Mapping unresolved: {unresolvedCount}
              </span>
              {loadError && (
                <span className="inline-flex rounded-full bg-rose-500/10 px-2 py-1 font-semibold text-rose-700 dark:text-rose-300">
                  Fallback active: {loadError}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <label className="relative flex-1 lg:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project, unit, PIC, or status"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </label>
            <label className="relative min-w-44">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-9 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <button
            type="button"
            onClick={async () => {
              try {
                setLoading(true);
                const res = await fetch('/api/capex/mapping', { cache: 'no-store' });
                const json = await res.json();
                if (json?.success && Array.isArray(json.data)) setMappingRows(json.data);
              } finally {
                setLoading(false);
              }
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-1 font-semibold text-slate-600 hover:bg-white dark:border-white/10 dark:bg-zinc-900/60 dark:text-slate-300"
          >
            <RefreshCcw size={12} /> Refresh mapping
          </button>
          <a href="/api/capex/mapping" className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-1 font-semibold text-slate-600 hover:bg-white dark:border-white/10 dark:bg-zinc-900/60 dark:text-slate-300">
            <DatabaseZap size={12} /> Mapping API
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          <SummaryCard label="Total Projects" value={summary.total} icon={<CalendarRange size={16} />} tone="from-cyan-500 to-blue-500" />
          <SummaryCard label="Done" value={summary.done} icon={<CheckCircle2 size={16} />} tone="from-emerald-500 to-green-500" />
          <SummaryCard label="On Track" value={summary.onTrack} icon={<TrendingUp size={16} />} tone="from-blue-500 to-indigo-500" />
          <SummaryCard label="Watch" value={summary.watch} icon={<Clock3 size={16} />} tone="from-amber-500 to-orange-500" />
          <SummaryCard label="At Risk" value={summary.atRisk} icon={<AlertTriangle size={16} />} tone="from-rose-500 to-red-500" />
          <SummaryCard label="Due ≤ 14d" value={summary.dueSoon} icon={<CalendarClock size={16} />} tone="from-fuchsia-500 to-pink-500" />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="glass-card p-5 xl:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full flex-shrink-0"></div>
            <Target size={14} className="text-indigo-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Project Gantt Table</h3>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200/60 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            ClickUp tasks only, displayed in spreadsheet row order.
          </div>

          <div className="overflow-x-auto scrollbar-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 border-b border-slate-200/60 dark:border-white/10">
                  <th className="py-3 pr-3">Project</th>
                  <th className="py-3 pr-3">Start</th>
                  <th className="py-3 pr-3">End</th>
                  <th className="py-3 pr-3">Progress</th>
                  <th className="py-3 pr-3">Status</th>
                  <th className="py-3 pr-0">Health</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const startDate = parseFlexibleDate(project.start);
                  const endDate = parseFlexibleDate(project.end);
                  const health = getHealth(project);
                  const isSelected = selectedProject?.id === project.id;

                  return (
                    <tr
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`border-b border-slate-100/80 dark:border-white/5 align-top cursor-pointer transition-colors ${isSelected ? "bg-cyan-500/5 dark:bg-cyan-400/5" : "hover:bg-slate-50/80 dark:hover:bg-white/5"}`}
                    >
                      <td className="py-3 pr-3 min-w-64">
                        <div className="font-semibold text-slate-800 dark:text-white leading-tight">{project.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{project.unit} • {project.pic ?? "—"}</div>
                      </td>
                      <td className="py-3 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{startDate ? format(startDate, "dd MMM yyyy") : project.start ?? "—"}</td>
                      <td className="py-3 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{endDate ? format(endDate, "dd MMM yyyy") : <span className="text-slate-400">TBD</span>}</td>
                      <td className="py-3 pr-3 min-w-36">
                        {typeof project.progress === "number" ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>{project.progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200/70 dark:bg-zinc-800 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No progress data</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 max-w-56">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase leading-tight ${getStatusTone(project.status)}`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="py-3 pr-0">
                        <HealthBadge health={health} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-blue-600 rounded-full flex-shrink-0"></div>
            <ShieldAlert size={14} className="text-cyan-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Project Detail</h3>
          </div>

          {selectedProject ? (
            <>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{selectedProject.name}</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-zinc-800 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{selectedProject.unit}</span>
                  <HealthBadge health={getHealth(selectedProject)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailItem label="PIC" value={selectedProject.pic ?? "—"} />
                <DetailItem label="Progress" value={typeof selectedProject.progress === "number" ? `${selectedProject.progress}%` : "No data"} />
                <DetailItem label="Start" value={parseFlexibleDate(selectedProject.start) ? format(parseFlexibleDate(selectedProject.start)!, "dd MMM yyyy") : selectedProject.start || "—"} />
                <DetailItem label="End" value={parseFlexibleDate(selectedProject.end) ? format(parseFlexibleDate(selectedProject.end)!, "dd MMM yyyy") : selectedProject.end || "TBD"} />
                <DetailItem label="Duration" value={getDuration(selectedProject) !== null ? `${getDuration(selectedProject)} days` : "Open project"} />
                <DetailItem label="Risk" value={getRiskReason(selectedProject)} />
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Sync Note</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{selectedProject.note ?? "No note recorded."}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Select a project to view detail.</p>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-gradient-to-b from-rose-500 to-red-600 rounded-full flex-shrink-0"></div>
            <AlertTriangle size={14} className="text-rose-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Risk Queue</h3>
          </div>
          <div className="space-y-3">
            {atRiskProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="w-full text-left rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-zinc-900/50 px-4 py-3 hover:border-rose-500/30 hover:bg-rose-500/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{project.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{project.unit} • {getRiskReason(project)}</p>
                  </div>
                  <HealthBadge health={getHealth(project)} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-gradient-to-b from-fuchsia-500 to-pink-600 rounded-full flex-shrink-0"></div>
            <CalendarClock size={14} className="text-fuchsia-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Due Soon</h3>
          </div>
          <div className="space-y-3">
            {dueSoonProjects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No projects due in the next 14 days.</p>
            ) : dueSoonProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="w-full text-left rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-zinc-900/50 px-4 py-3 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{project.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{project.unit}</p>
                  </div>
                  <span className="inline-flex rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-bold uppercase text-fuchsia-700 dark:text-fuchsia-300">
                    {getDaysToEnd(project)}d
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 p-4 backdrop-blur-sm">
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${tone}`}></div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-slate-500 dark:text-slate-400">{icon}</div>
        <span className="text-2xl font-bold text-slate-800 dark:text-white">{value}</span>
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function HealthBadge({ health }: { health: string }) {
  const toneMap: Record<string, string> = {
    Done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    "On Track": "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20",
    Watch: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
    "At Risk": "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20",
    "Needs Closure": "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/20",
    Monitor: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${toneMap[health] || toneMap.Monitor}`}>
      {health}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/50 dark:bg-zinc-900/50 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug">{value}</p>
    </div>
  );
}
