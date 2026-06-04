"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, eachWeekOfInterval, addDays, parseISO, isValid } from "date-fns";
import { BarChart2, Camera, Search, ChevronDown } from "lucide-react";

type ProjectMeta = {
  id: string;
  project_code: string;
  project_name: string;
  unit_name: string | null;
  unit_code: string | null;
  priority_name: string | null;
  priority_color: string | null;
  status_label: string | null;
  status_color: string | null;
  current_phase_name: string | null;
  overall_progress_pct: string | null;
  pm_start: string | null;
  pm_end: string | null;
  start_date: string | null;
  end_date: string | null;
};

type Photo = {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  uploaded_by_name: string | null;
};

type WeekProgress = {
  plan_pct: number;
  actual_pct: number;
  status: string;
};

type WeekEntry = {
  week: number;
  weekKey: string;
  monthKey: string;
  range: string;
};

type WeekData = {
  progress: WeekProgress;
  photos: Photo[];
};

function buildWeeks(startRaw: string | null, endRaw: string | null): WeekEntry[] {
  const start = startRaw ? parseISO(startRaw) : null;
  const end   = endRaw   ? parseISO(endRaw)   : null;
  if (!start || !isValid(start) || !end || !isValid(end) || start > end) return [];
  const mondays = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return mondays.map((mon, i) => {
    const sun     = addDays(mon, 6);
    const weekEnd = sun > end ? end : sun;
    return {
      week:    i + 1,
      weekKey: `week-${format(mon, "yyyy-MM-dd")}`,
      monthKey: format(mon, "MMM yyyy"),
      range:   `${format(mon, "d MMM")} – ${format(weekEnd, "d MMM")}`,
    };
  });
}

function statusColor(s: string) {
  if (s === "Completed")   return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10";
  if (s === "On progress") return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10";
  if (s === "Delayed")     return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10";
  return "text-slate-400 bg-slate-100 dark:bg-white/5";
}

function statusDot(s: string) {
  if (s === "Completed")   return "bg-emerald-500";
  if (s === "On progress") return "bg-blue-500";
  if (s === "Delayed")     return "bg-amber-500";
  return "bg-slate-400";
}

// ─── ProjectWeeklySection ─────────────────────────────────────────────────────
function ProjectWeeklySection({ project }: { project: ProjectMeta }) {
  const startDate = project.pm_start ?? project.start_date;
  const endDate   = project.pm_end   ?? project.end_date;
  const weeks     = buildWeeks(startDate, endDate);

  const months = Array.from(new Map(weeks.map(w => [w.monthKey, w.monthKey])).entries());
  const [activeMonth, setActiveMonth] = useState(months[months.length - 1]?.[0] ?? "");
  const [expanded, setExpanded]       = useState(true);
  const [weekData, setWeekData]       = useState<Record<string, WeekData>>({});
  const [loaded, setLoaded]           = useState(false);
  const bodyRef   = useRef<HTMLDivElement>(null);
  const heightRef = useRef<number>(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (expanded) {
      el.style.maxHeight = `${el.scrollHeight}px`;
      heightRef.current  = el.scrollHeight;
    } else {
      el.style.maxHeight = `${el.scrollHeight}px`;
      requestAnimationFrame(() => { el.style.maxHeight = "0px"; });
    }
  }, [expanded]);

  // Re-measure when content loads so max-height stays accurate
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !expanded) return;
    el.style.maxHeight = `${el.scrollHeight}px`;
    heightRef.current  = el.scrollHeight;
  }, [weekData, activeMonth, expanded]);

  useEffect(() => {
    if (!expanded || loaded) return;
    setLoaded(true);
    const filtered = weeks.filter(w => w.monthKey === activeMonth);
    filtered.forEach(w => {
      Promise.all([
        fetch(`/api/projects/${project.id}/attachments?week_key=${w.weekKey}`).then(r => r.json()),
        fetch(`/api/projects/${project.id}/week-progress`).then(r => r.json()),
      ]).then(([attachRes, progressRes]) => {
        const photos = attachRes.success ? (attachRes.data as Photo[]).filter((p: Photo) => (p.mime_type ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(p.file_name)) : [];
        const progressRow = progressRes.success ? progressRes.data.find((d: { week_key: string }) => d.week_key === w.weekKey) : null;
        const progress: WeekProgress = progressRow
          ? { plan_pct: Number(progressRow.plan_pct), actual_pct: Number(progressRow.actual_pct), status: progressRow.status ?? "Not started" }
          : { plan_pct: 0, actual_pct: 0, status: "Not started" };
        setWeekData(prev => ({ ...prev, [w.weekKey]: { photos, progress } }));
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, activeMonth]);

  const filteredWeeks = weeks.filter(w => w.monthKey === activeMonth);
  const overallPct    = Number(project.overall_progress_pct ?? 0);

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-white/8 overflow-hidden bg-white/60 dark:bg-zinc-900/50">
      {/* Project header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8 text-left hover:bg-slate-50/60 dark:hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
              {project.project_name}
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
              {project.project_code}
            </span>
            {project.priority_name && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: project.priority_color ?? undefined, backgroundColor: `${project.priority_color}18` }}
              >
                {project.priority_name}
              </span>
            )}
            {project.status_label && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: project.status_color ?? undefined, backgroundColor: `${project.status_color}18` }}
              >
                {project.status_label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {project.unit_name && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{project.unit_name}</span>
            )}
            {project.current_phase_name && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Phase: {project.current_phase_name}</span>
            )}
            {weeks.length > 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{weeks.length} weeks</span>
            )}
          </div>
        </div>
        {/* Overall progress */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">Overall</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{overallPct.toFixed(1)}%</p>
          </div>
          <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-brand-sienna transition-all" style={{ width: `${Math.min(100, overallPct)}%` }} />
          </div>
          <ChevronDown size={15} className="text-slate-400 shrink-0 transition-transform duration-300" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
        </div>
      </button>

      <div
        ref={bodyRef}
        style={{ maxHeight: expanded ? `${heightRef.current || 9999}px` : "0px", overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)" }}
      >
          {weeks.length === 0 ? (
            <div className="p-6 flex items-center gap-2 text-slate-400 dark:text-slate-600 text-xs">
              <Camera size={14} />
              No project dates set — weekly progress unavailable.
            </div>
          ) : (
            <>
              {/* Month tabs */}
              <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-200/50 dark:border-white/8 bg-slate-50/50 dark:bg-white/2 flex-wrap">
                {months.map(([key]) => (
                  <button
                    key={key}
                    onClick={() => { setActiveMonth(key); setLoaded(false); }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      activeMonth === key
                        ? "text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/8"
                    }`}
                    style={activeMonth === key ? { backgroundColor: "var(--brand-sienna)" } : undefined}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {/* Weeks grid */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredWeeks.map(w => {
                  const data = weekData[w.weekKey];
                  const prog = data?.progress ?? { plan_pct: 0, actual_pct: 0, status: "Not started" };
                  const variance = Number((prog.actual_pct - prog.plan_pct).toFixed(2));

                  return (
                    <div key={w.weekKey} className="rounded-xl border border-slate-200/60 dark:border-white/8 overflow-hidden">
                      {/* Week header */}
                      <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(251,191,36,0.12)" }}>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400">Week {w.week}</span>
                        <span className="text-[10px] text-amber-600/80 dark:text-amber-500/80">{w.range}</span>
                        {data && (
                          <span className={`ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${statusColor(prog.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(prog.status)}`} />
                            {prog.status}
                          </span>
                        )}
                      </div>

                      {/* Photos */}
                      {data?.photos && data.photos.length > 0 ? (
                        <div className="flex gap-1.5 p-2.5 flex-wrap bg-slate-50/50 dark:bg-white/2">
                          {data.photos.slice(0, 4).map((photo, pi) => (
                            <div key={photo.id} className="relative">
                              <img
                                src={photo.file_url}
                                alt={photo.file_name}
                                className="w-20 h-16 object-cover rounded-lg border border-slate-200/60 dark:border-white/8"
                                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              {pi === 3 && data.photos.length > 4 && (
                                <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">+{data.photos.length - 4}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-3 flex items-center gap-1.5 text-slate-400 dark:text-slate-600 text-[11px] bg-slate-50/30 dark:bg-white/1">
                          <Camera size={11} />
                          No photos
                        </div>
                      )}

                      {/* Progress stats */}
                      {data ? (
                        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/6 border-t border-slate-100 dark:border-white/6">
                          <div className="px-2.5 py-2">
                            <p className="text-[8px] uppercase tracking-widest text-slate-400 mb-0.5">Plan</p>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{prog.plan_pct > 0 ? `${prog.plan_pct.toFixed(1)}%` : "—"}</p>
                          </div>
                          <div className="px-2.5 py-2">
                            <p className="text-[8px] uppercase tracking-widest text-slate-400 mb-0.5">Actual</p>
                            <p className={`text-xs font-bold ${prog.actual_pct >= prog.plan_pct ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {prog.actual_pct > 0 ? `${prog.actual_pct.toFixed(1)}%` : "—"}
                            </p>
                          </div>
                          <div className="px-2.5 py-2">
                            <p className="text-[8px] uppercase tracking-widest text-slate-400 mb-0.5">Var</p>
                            <p className={`text-xs font-bold ${variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-rose-500" : "text-slate-400"}`}>
                              {prog.actual_pct > 0 ? `${variance > 0 ? "+" : ""}${variance.toFixed(1)}%` : "—"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 py-2 flex items-center gap-1.5 text-slate-300 dark:text-slate-700 text-[10px]">
                          <div className="w-3 h-3 border border-slate-300 dark:border-slate-700 border-t-transparent rounded-full animate-spin" />
                          Loading...
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter(p =>
    !search.trim() ||
    [p.project_name, p.project_code, p.unit_name, p.unit_code]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-10 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 mt-2 justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-amber-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Weekly Report</h2>
        </div>
        <label className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter projects..."
            className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white w-52"
          />
        </label>
      </div>

      {/* Title card */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200/50 dark:border-white/8">
          <Camera size={16} className="shrink-0" style={{ color: "var(--brand-sienna)" }} />
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-widest">Weekly Progress Report</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">All projects — photos &amp; progress per week</p>
          </div>
          <span className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
            {filtered.length} project{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400 dark:text-slate-600">
            {search ? "No projects match your search." : "No projects found."}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filtered.map(p => (
              <ProjectWeeklySection key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
