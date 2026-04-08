"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Filter, Search } from "lucide-react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  min,
  parse,
} from "date-fns";

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
  if (s.includes("done")) return "bg-cyan-600 text-white";
  if (s.includes("on schedule")) return "bg-blue-600 text-white";
  if (s.includes("ongoing")) return "bg-teal-600 text-white";
  if (s.includes("commenced")) return "bg-sky-600 text-white";
  return "bg-slate-600 text-white";
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

type GanttRow = {
  project: CapexProject;
  startDate: Date;
  endDate: Date;
  offset: number;
  width: number;
  progressPct?: number;
};

type WeekBucket = {
  start: Date;
  end: Date;
  monthIndex: number;
};

const DETAIL_KEYS = ["Source Key", "Unit", "Start", "End", "Status", "Progress", "PIC", "Project Status Note", "Next Action", "Managed by"];

function splitTaskNote(note?: string) {
  if (!note) return [] as Array<{ label: string; value: string }>;

  const compact = note.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  const parts = compact.split(/\s(?=(?:Source Key|Unit|Start|End|Status|Progress|PIC|Project Status Note|Next Action|Managed by):)/g);

  return parts
    .map((part, index) => {
      const match = part.match(/^([^:]{2,40}):\s*(.+)$/);
      if (match && DETAIL_KEYS.includes(match[1])) {
        return { label: match[1], value: match[2] };
      }
      if (index === 0) {
        return { label: "Description", value: part };
      }
      return { label: "Info", value: part };
    })
    .filter((item) => item.value.length > 0);
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
      } catch (error: unknown) {
        if (!active) return;
        setProjects([]);
        setLoadError(error instanceof Error ? error.message : 'Failed to load CAPEX projects');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProjects();
    return () => {
      active = false;
    };
  }, []);

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

  const summary = useMemo(() => {
    const done = filteredProjects.filter((p) => getHealth(p) === "Done").length;
    const active = filteredProjects.length - done;
    const atRisk = filteredProjects.filter((p) => ["At Risk", "Needs Closure", "Watch"].includes(getHealth(p))).length;
    return { total: filteredProjects.length, done, active, atRisk };
  }, [filteredProjects]);

  const unitSummary = useMemo(() => {
    const grouped = new Map<string, { total: number; done: number; atRisk: number }>();

    for (const project of filteredProjects) {
      const unit = (project.unit || "UNKNOWN").trim().toUpperCase();
      const health = getHealth(project);
      const existing = grouped.get(unit) || { total: 0, done: 0, atRisk: 0 };

      existing.total += 1;
      if (health === "Done") existing.done += 1;
      if (["At Risk", "Needs Closure", "Watch"].includes(health)) existing.atRisk += 1;
      grouped.set(unit, existing);
    }

    return Array.from(grouped.entries())
      .map(([unit, values]) => ({ unit, ...values }))
      .sort((a, b) => a.unit.localeCompare(b.unit));
  }, [filteredProjects]);

  const timeline = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const start = new Date(currentYear, 0, 1);
    const end = new Date(currentYear, 11, 31);
    return { start, end };
  }, []);

  const weekBuckets = useMemo<WeekBucket[]>(() => {
    const buckets: WeekBucket[] = [];
    let cursor = timeline.start;

    while (cursor <= timeline.end) {
      const weekEnd = min([addDays(cursor, 6), timeline.end]);
      buckets.push({
        start: cursor,
        end: weekEnd,
        monthIndex: cursor.getMonth(),
      });
      cursor = addDays(weekEnd, 1);
    }

    return buckets;
  }, [timeline]);

  const monthSegments = useMemo(() => {
    if (weekBuckets.length === 0) return [] as Array<{ label: string; weeks: number; key: string }>;

    const segments: Array<{ label: string; weeks: number; key: string }> = [];
    let currentMonth = weekBuckets[0].monthIndex;
    let currentCount = 0;

    for (const bucket of weekBuckets) {
      if (bucket.monthIndex === currentMonth) {
        currentCount += 1;
      } else {
        segments.push({
          label: format(new Date(timeline.start.getFullYear(), currentMonth, 1), "MMM"),
          weeks: currentCount,
          key: `${currentMonth}-${segments.length}`,
        });
        currentMonth = bucket.monthIndex;
        currentCount = 1;
      }
    }

    segments.push({
      label: format(new Date(timeline.start.getFullYear(), currentMonth, 1), "MMM"),
      weeks: currentCount,
      key: `${currentMonth}-${segments.length}`,
    });

    return segments;
  }, [timeline, weekBuckets]);

  const todayOffset = useMemo(() => {
    const totalDays = Math.max(1, differenceInCalendarDays(timeline.end, timeline.start) + 1);
    const today = new Date();
    if (today < timeline.start) return 0;
    if (today > timeline.end) return 100;
    return (differenceInCalendarDays(today, timeline.start) / totalDays) * 100;
  }, [timeline]);

  const ganttRows = useMemo<GanttRow[]>(() => {
    const totalDays = Math.max(1, differenceInCalendarDays(timeline.end, timeline.start) + 1);

    return filteredProjects.map((project) => {
      const startDate = parseFlexibleDate(project.start) ?? timeline.start;
      const rawEnd = parseFlexibleDate(project.end);
      const endDate = rawEnd ?? addDays(startDate, 45);
      const safeEndDate = endDate < startDate ? addDays(startDate, 15) : endDate;

      const clampedStart = startDate < timeline.start ? timeline.start : startDate;
      const clampedEnd = safeEndDate > timeline.end ? timeline.end : safeEndDate;
      const visibleDuration = Math.max(1, differenceInCalendarDays(clampedEnd, clampedStart) + 1);
      const offset = Math.max(0, (differenceInCalendarDays(clampedStart, timeline.start) / totalDays) * 100);
      const width = Math.max(1.2, (visibleDuration / totalDays) * 100);
      const progressPct = typeof project.progress === "number"
        ? Math.max(0, Math.min(100, project.progress))
        : undefined;

      return {
        project,
        startDate,
        endDate: safeEndDate,
        offset,
        width,
        progressPct,
      };
    });
  }, [filteredProjects, timeline]);

  const selectedNoteItems = useMemo(() => splitTaskNote(selectedProject?.note), [selectedProject]);

  const unresolvedCount = mappingRows.filter((row) => !row.clickupTaskId).length;
  const statusOptions = ["All", "Done", "On Track", "Watch", "At Risk", "Needs Closure", "Monitor"];

  return (
    <div className="space-y-4">
      <section className="glass-card p-5 space-y-4 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-sky-600 rounded-t-2xl"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarRange size={14} className="text-cyan-600" />
              <h3 className="text-base font-bold text-slate-800 dark:text-white">CAPEX Gantt Chart</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Timeline view from ClickUp data. Click a row to see details.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <label className="relative flex-1 lg:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project or PIC"
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
          <span className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${loading ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
            {loading ? "Syncing ClickUp..." : "Live source: ClickUp"}
          </span>
          <span className="inline-flex rounded-full bg-slate-200/70 dark:bg-zinc-800 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300">
            Showing {summary.total} projects
          </span>
          <span className="inline-flex rounded-full bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-700 dark:text-cyan-300">
            Done {summary.done}
          </span>
          <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 font-semibold text-blue-700 dark:text-blue-300">
            Active {summary.active}
          </span>
          <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300">
            At Risk {summary.atRisk}
          </span>
          <span className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${unresolvedCount > 0 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
            Mapping unresolved: {unresolvedCount}
          </span>
          {loadError && (
            <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300">
              Fallback active: {loadError}
            </span>
          )}
        </div>

        {unitSummary.length > 0 && (
          <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 p-2.5">
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Unit Summary</p>
            <div className="flex flex-wrap gap-2">
              {unitSummary.map((item) => (
                <span
                  key={item.unit}
                  className="inline-flex items-center rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-zinc-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                  title={`${item.unit}: total ${item.total}, done ${item.done}, at risk ${item.atRisk}`}
                >
                  {item.unit} {item.done}/{item.total}
                  {item.atRisk > 0 ? ` • risk ${item.atRisk}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="glass-card p-4 overflow-x-auto">
        <div className="min-w-[1320px]">
          <div className="grid grid-cols-[260px_1fr] items-center gap-3 pb-2 border-b border-slate-200/60 dark:border-white/10">
            <div className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
              Task List
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}>
              {monthSegments.map((segment) => (
                <div
                  key={segment.key}
                  className="rounded-md bg-slate-900 px-2 py-2 text-center text-[11px] font-semibold text-white"
                  style={{ gridColumn: `span ${segment.weeks} / span ${segment.weeks}` }}
                >
                  {segment.label}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[260px_1fr] items-center gap-3 pt-2 pb-3 border-b border-slate-200/40 dark:border-white/10">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Week</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}>
              {weekBuckets.map((bucket, index) => (
                <div
                  key={`${bucket.start.toISOString()}-${index}`}
                  className="text-center text-[10px] font-medium text-slate-500 dark:text-slate-400"
                  title={`${format(bucket.start, "dd MMM")} - ${format(bucket.end, "dd MMM yyyy")}`}
                >
                  {format(bucket.start, "dd")}
                </div>
              ))}
            </div>
          </div>

          {ganttRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No projects match your current filter.</p>
          ) : (
            <div className="pt-2 space-y-2.5">
              {ganttRows.map((row) => {
                const isSelected = selectedProject?.id === row.project.id;
                return (
                  <button
                    key={row.project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(row.project.id)}
                    className={`w-full grid grid-cols-[260px_1fr] items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors ${isSelected ? "bg-cyan-500/10" : "hover:bg-slate-100/60 dark:hover:bg-white/5"}`}
                  >
                    <div className="pl-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{row.project.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {row.project.unit} • {row.project.pic ?? "No PIC"}
                      </p>
                    </div>

                    <div className="relative h-9">
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}
                      >
                        {weekBuckets.map((bucket, index) => (
                          <div
                            key={`line-${bucket.start.toISOString()}-${index}`}
                            className="h-full border-r border-slate-200/60 dark:border-white/10"
                          ></div>
                        ))}
                      </div>
                      <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-300/90 dark:bg-white/20"></div>
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-rose-500/80"
                        style={{ left: `${todayOffset}%` }}
                        title={`Today: ${format(new Date(), "dd MMM yyyy")}`}
                      ></div>
                      <div
                        className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-full px-1 text-[10px] font-semibold flex items-center whitespace-nowrap overflow-hidden ${getStatusTone(row.project.status)}`}
                        style={{ left: `${row.offset}%`, width: `${row.width}%` }}
                        title={`${format(row.startDate, "dd MMM yyyy")} - ${format(row.endDate, "dd MMM yyyy")}`}
                      >
                        {typeof row.progressPct === "number" && (
                          <div
                            className="h-full rounded-full bg-black/20"
                            style={{ width: `${row.progressPct}%` }}
                          ></div>
                        )}
                        <span className="absolute left-3 right-2 truncate">
                          {typeof row.progressPct === "number" ? `${row.progressPct}%` : "No progress"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {selectedProject && (
        <section className="glass-card p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedProject.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{selectedProject.unit}</p>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(selectedProject.status)}`}>
              {selectedProject.status}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
            <MiniInfo label="PIC" value={selectedProject.pic ?? "-"} />
            <MiniInfo label="Start" value={parseFlexibleDate(selectedProject.start) ? format(parseFlexibleDate(selectedProject.start)!, "dd MMM yyyy") : selectedProject.start ?? "-"} />
            <MiniInfo label="End" value={parseFlexibleDate(selectedProject.end) ? format(parseFlexibleDate(selectedProject.end)!, "dd MMM yyyy") : selectedProject.end ?? "TBD"} />
            <MiniInfo label="Duration" value={getDuration(selectedProject) !== null ? `${getDuration(selectedProject)} days` : "Open"} />
            <MiniInfo label="Risk" value={getRiskReason(selectedProject)} />
          </div>

          <div className="mt-3 rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Task Description</p>
            {selectedNoteItems.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedNoteItems.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-md border border-slate-200/60 dark:border-white/10 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</p>
                    <p className="mt-1 text-sm leading-relaxed break-words text-slate-700 dark:text-slate-200">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed break-words text-slate-600 dark:text-slate-300">No task description available.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-zinc-900/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{value}</p>
    </div>
  );
}
