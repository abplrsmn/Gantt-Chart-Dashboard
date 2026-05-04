"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, format, addDays, isValid, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import SCurveCharts from "./SCurveCharts";
import AnimatedDropdown from "./AnimatedDropdown";

// ─── Types ────────────────────────────────────────────────────────────────────
type PhaseKey = "brief" | "design" | "control" | "pm" | "handover";

const PHASES: { key: PhaseKey; label: string; color: string }[] = [
  { key: "brief",    label: "Operational Brief",  color: "#64748b" },
  { key: "design",   label: "Design",             color: "#3b82f6" },
  { key: "control",  label: "Project Control",    color: "#f59e0b" },
  { key: "pm",       label: "Project Management", color: "#14b8a6" },
  { key: "handover", label: "Handover",           color: "#22c55e" },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  CRITICAL: { label: "Critical", color: "#ef4444", dot: "bg-red-500" },
  HIGH:     { label: "High",     color: "#f97316", dot: "bg-orange-500" },
  MID:      { label: "Mid",      color: "#eab308", dot: "bg-yellow-500" },
  LOW:      { label: "Low",      color: "#22c55e", dot: "bg-green-500" },
};

type DBProject = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: string | null;
  start_date: string | null;
  end_date: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  status_label: string | null;
  priority_name: string | null;
  priority_code: string | null;
  priority_color: string | null;
  brief_received: string | null;
  brief_deadline: string | null;
  brief_progress: string | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: string | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: string | null;
  phase_contract_amount: string | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_progress: string | null;
  deviation_days: number | null;
  current_site_progress: string | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: string | null;
  actual_phase_completion_date: string | null;
};

type PhaseSegment = {
  key: PhaseKey;
  label: string;
  color: string;
  start: Date;
  end: Date;
  progress: number;
  offsetPct: number;
  widthPct: number;
};

type WeekCol = { start: Date; end: Date; weekNum: number; monthLabel: string; isFirstOfMonth: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isValid(d) ? d : null;
}

function buildSegments(p: DBProject, timelineStart: Date, totalDays: number): PhaseSegment[] {
  const projectStart = toDate(p.start_date) ?? timelineStart;
  const projectEnd   = toDate(p.end_date)   ?? addDays(projectStart, 90);

  const raw: { key: PhaseKey; start: Date | null; end: Date | null; progress: number }[] = [
    { key: "brief",    start: toDate(p.brief_received),  end: toDate(p.brief_deadline), progress: Number(p.brief_progress ?? 100) },
    { key: "design",   start: toDate(p.design_start),    end: toDate(p.design_end),     progress: Number(p.design_progress ?? 50) },
    { key: "control",  start: toDate(p.control_start),   end: toDate(p.control_end),    progress: Number(p.control_progress ?? 50) },
    { key: "pm",       start: toDate(p.pm_start),        end: toDate(p.pm_end),         progress: Number(p.pm_progress ?? 50) },
    { key: "handover", start: toDate(p.handover_start),  end: toDate(p.handover_end),   progress: Number(p.handover_progress ?? 20) },
  ];

  return raw.flatMap(r => {
    const s = r.start ?? projectStart;
    const e = r.end   ?? addDays(s, 14);
    if (e < s) return [];
    const offsetDays = differenceInCalendarDays(s, timelineStart);
    const widthDays  = Math.max(1, differenceInCalendarDays(e, s));
    const offsetPct  = Math.max(0, (offsetDays / totalDays) * 100);
    const widthPct   = Math.max(0.3, (widthDays / totalDays) * 100);
    const ph = PHASES.find(ph => ph.key === r.key)!;
    return [{ key: r.key, label: ph.label, color: ph.color, start: s, end: e, progress: r.progress, offsetPct, widthPct }];
  });
}

function isPhaseActive(phKey: PhaseKey, phaseCode: string | null): boolean {
  if (!phaseCode) return false;
  const map: Record<string, PhaseKey> = {
    operational_brief: "brief", design: "design",
    project_control: "control", project_management: "pm", handover: "handover",
  };
  return map[phaseCode] === phKey;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProjectGanttDB() {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [yearFilter, setYearFilter]         = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    seg: PhaseSegment; project: DBProject; x: number; y: number;
  } | null>(null);

  // Refs for synced horizontal scroll between sticky header and body
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);

  const onBodyScroll = () => {
    if (headerRef.current && bodyRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    fetch("/api/projects/gantt")
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Available years — always include current year
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    for (const p of projects) {
      [p.brief_received, p.design_start, p.pm_start, p.handover_start, p.start_date,
       p.brief_deadline, p.design_end, p.control_start, p.control_end, p.pm_end, p.handover_end]
        .map(toDate).filter(Boolean).forEach(d => years.add(d!.getFullYear()));
    }
    return Array.from(years).sort();
  }, [projects]);

  // Date range bounds
  const rangeStart = useMemo(() => dateRange.start ? new Date(dateRange.start) : null, [dateRange.start]);
  const rangeEnd   = useMemo(() => dateRange.end   ? new Date(dateRange.end)   : null, [dateRange.end]);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = [p.project_name, p.project_code, p.status_label, p.current_phase_name]
        .join(" ").toLowerCase().includes(search.toLowerCase());
      const matchPriority = priorityFilter === "ALL" || p.priority_code === priorityFilter;

      // Year filter — project has any date in selected year
      const matchYear = yearFilter === "ALL" || [
        p.brief_received, p.design_start, p.pm_start, p.start_date,
        p.brief_deadline, p.design_end, p.pm_end, p.handover_end,
      ].map(toDate).filter(Boolean).some(d => d!.getFullYear() === Number(yearFilter));

      // Project overlaps range if any phase date falls within [rangeStart, rangeEnd]
      let matchRange = true;
      if (rangeStart && rangeEnd) {
        const dates = [
          p.brief_received, p.brief_deadline,
          p.design_start, p.design_end,
          p.control_start, p.control_end,
          p.pm_start, p.pm_end,
          p.handover_start, p.handover_end,
          p.start_date, p.end_date,
        ].map(toDate).filter((d): d is Date => d !== null);
        // Project overlaps if any date is within range OR project spans across range
        const projectMin = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
        const projectMax = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
        matchRange = !projectMin || !projectMax
          ? true
          : projectMin <= rangeEnd && projectMax >= rangeStart;
      }

      return matchSearch && matchPriority && matchYear && matchRange;
    });
  }, [projects, search, priorityFilter, yearFilter, rangeStart, rangeEnd]);

  // Timeline: year filter sets bounds, date range overrides if set
  const timeline = useMemo(() => {
    // Date range picker takes priority
    if (rangeStart && rangeEnd && isValid(rangeStart) && isValid(rangeEnd)) {
      return { start: rangeStart, end: rangeEnd };
    }
    // Year filter
    if (yearFilter !== "ALL") {
      const y = Number(yearFilter);
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    const allDates: Date[] = [];
    for (const p of filtered) {
      [p.brief_received, p.brief_deadline, p.design_start, p.design_end,
       p.control_start, p.control_end, p.pm_start, p.pm_end,
       p.handover_start, p.handover_end, p.start_date, p.end_date]
        .map(toDate).filter((d): d is Date => d !== null).forEach(d => allDates.push(d));
    }
    if (allDates.length === 0) {
      const y = new Date().getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    const minT = Math.min(...allDates.map(d => d.getTime()));
    const maxT = Math.max(...allDates.map(d => d.getTime()));
    return {
      start: new Date(new Date(minT).getFullYear(), 0, 1),
      end:   new Date(new Date(maxT).getFullYear(), 11, 31),
    };
  }, [filtered, rangeStart, rangeEnd, yearFilter]);

  const totalDays = useMemo(() =>
    Math.max(1, differenceInCalendarDays(timeline.end, timeline.start) + 1),
    [timeline]
  );

  // Build week columns
  const weekCols = useMemo<WeekCol[]>(() => {
    const cols: WeekCol[] = [];
    let cursor = startOfWeek(timeline.start, { weekStartsOn: 1 }); // Monday
    let weekNum = 1;
    let prevMonth = -1;
    while (cursor <= timeline.end) {
      const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      // Use the later of cursor or timeline.start for labeling,
      // so a week starting in Apr but with range starting in May shows "May"
      const labelDate = cursor < timeline.start ? timeline.start : cursor;
      const isFirst = labelDate.getMonth() !== prevMonth;
      cols.push({
        start: cursor,
        end: wEnd,
        weekNum,
        monthLabel: format(labelDate, "MMM"),
        isFirstOfMonth: isFirst,
      });
      prevMonth = labelDate.getMonth();
      cursor = addWeeks(cursor, 1);
      weekNum++;
    }
    return cols;
  }, [timeline]);

  // Group week cols by month for the month header row
  const monthGroups = useMemo(() => {
    const groups: { label: string; colSpan: number }[] = [];
    for (const wc of weekCols) {
      if (wc.isFirstOfMonth) {
        // Use clamped labelDate for consistent month/year display
        const labelDate = wc.start < timeline.start ? timeline.start : wc.start;
        groups.push({ label: format(labelDate, "MMM yyyy"), colSpan: 1 });
      } else {
        groups[groups.length - 1].colSpan++;
      }
    }
    return groups;
  }, [weekCols, timeline]);

  const todayOffsetPct = useMemo(() => {
    const today = new Date();
    if (today < timeline.start) return 0;
    if (today > timeline.end) return 100;
    return (differenceInCalendarDays(today, timeline.start) / totalDays) * 100;
  }, [timeline, totalDays]);

  const WEEK_W = 36; // px per week column
  const totalWidth = weekCols.length * WEEK_W; // total gantt width in px

  function segmentStyle(seg: PhaseSegment): React.CSSProperties {
    return {
      left: `${(seg.offsetPct / 100) * totalWidth}px`,
      width: `${Math.max(4, (seg.widthPct / 100) * totalWidth)}px`,
    };
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      Loading...
    </div>
  );
  if (error) return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">❌ {error}</div>
  );

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-center">
        {/* Search */}
        <label className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, phase, status..."
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30 text-slate-800 dark:text-white"
          />
        </label>
        {/* Priority */}
        <AnimatedDropdown
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={[
            { value: "ALL",      label: "All Priorities" },
            { value: "CRITICAL", label: "Critical", color: "#ef4444" },
            { value: "HIGH",     label: "High",     color: "#f97316" },
            { value: "MID",      label: "Mid",      color: "#eab308" },
            { value: "LOW",      label: "Low",      color: "#22c55e" },
          ]}
          minWidth={160}
        />
        {/* Year */}
        <AnimatedDropdown
          value={yearFilter}
          onChange={setYearFilter}
          options={[
            { value: "ALL", label: "All Years" },
            ...availableYears.map(y => ({ value: String(y), label: String(y) })),
          ]}
          minWidth={130}
          align="right"
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        {PHASES.map(ph => (
          <div key={ph.key} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: ph.color }} />
            {ph.label}
          </div>
        ))}
        <span className="ml-auto text-[11px] text-slate-400 italic">{filtered.length} / {projects.length} projects</span>
      </div>

      {/* Date range picker */}
      <DateRangePicker value={dateRange} onChange={setDateRange} />

      {/* Gantt */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm">

        {/* ── Sticky headers (outside overflow-x-auto so they stick on vertical scroll) ── */}
        <div className="sticky top-14 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-t-2xl border-b border-slate-200/60 dark:border-white/8">
          {/* header scroll mirror — hidden overflow, synced via JS */}
          <div ref={headerRef} className="overflow-x-hidden">
            <div style={{ minWidth: `${240 + totalWidth}px` }}>

              {/* Month row */}
              <div className="flex border-b border-slate-200/50 dark:border-white/8">
                <div className="sticky left-0 z-10 shrink-0 w-60 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 border-r border-slate-200/60 dark:border-white/8 bg-white/95 dark:bg-zinc-900/95">
                  PROJECT
                </div>
                <div className="flex" style={{ width: `${totalWidth}px` }}>
                  {monthGroups.map((mg, i) => (
                    <div
                      key={i}
                      className="text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 py-2 border-r border-slate-200/40 dark:border-white/6 overflow-hidden"
                      style={{ width: `${mg.colSpan * WEEK_W}px`, minWidth: 0 }}
                    >
                      {mg.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Week row */}
              <div className="flex">
                <div className="sticky left-0 z-10 shrink-0 w-60 border-r border-slate-200/60 dark:border-white/8 bg-white/95 dark:bg-zinc-900/95" />
                <div className="flex" style={{ width: `${totalWidth}px` }}>
                  {weekCols.map((wc, i) => (
                    <div
                      key={i}
                      className={`text-center text-[9px] py-1 border-r shrink-0 ${
                        wc.isFirstOfMonth
                          ? "border-slate-300/60 dark:border-white/12 font-bold text-slate-500 dark:text-slate-300"
                          : "border-slate-100/70 dark:border-white/5 text-slate-400 dark:text-slate-500"
                      }`}
                      style={{ width: `${WEEK_W}px` }}
                      title={`${format(wc.start, "dd MMM")} – ${format(wc.end, "dd MMM yyyy")}`}
                    >
                      {wc.isFirstOfMonth ? format(wc.start, "d") : `W${((i % 4) + 1)}`}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div ref={bodyRef} className="overflow-x-auto" onScroll={onBodyScroll}>
          <div style={{ minWidth: `${240 + totalWidth}px` }}>

            {/* Project rows */}
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                No projects match your filter.
              </div>
            ) : filtered.map(p => {
              const segments = buildSegments(p, timeline.start, totalDays);
              const overallProgress = Number(p.overall_progress_pct ?? 0);
              const pCfg = PRIORITY_CONFIG[p.priority_code ?? ""] ?? { label: p.priority_name ?? "–", color: "#94a3b8", dot: "bg-slate-400" };
              const isExpanded = expandedId === p.id;
              const todayPx = (todayOffsetPct / 100) * totalWidth;

              // Is any phase running today?
              const today = new Date();
              const isActiveToday = segments.some(s => today >= s.start && today <= s.end);
              const activeTodayPhase = segments.find(s => today >= s.start && today <= s.end);

              return (
                <div
                  key={p.id}
                  className={`border-b border-slate-100/80 dark:border-white/4 last:border-0 ${
                    isActiveToday ? "bg-cyan-50/30 dark:bg-cyan-900/10" : ""
                  }`}
                  style={isActiveToday ? { borderLeft: `3px solid ${activeTodayPhase?.color ?? "#06b6d4"}` } : {}}
                >
                  {/* Row */}
                  <div
                    className="flex items-center hover:bg-slate-50/70 dark:hover:bg-white/3 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {/* Left: project info — sticky on horizontal scroll */}
                    <div className="sticky left-0 z-10 shrink-0 w-60 px-3 py-2.5 border-r border-slate-200/40 dark:border-white/5 bg-white/95 dark:bg-zinc-900/95">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pCfg.dot}`} />
                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: pCfg.color }}>{pCfg.label}</span>
                        {isActiveToday && (
                          <span
                            className="ml-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                            style={{ backgroundColor: `${activeTodayPhase?.color ?? "#06b6d4"}25`, color: activeTodayPhase?.color ?? "#06b6d4", border: `1px solid ${activeTodayPhase?.color ?? "#06b6d4"}50` }}
                          >
                            ● TODAY
                          </span>
                        )}
                        <span className="ml-auto text-slate-300 dark:text-slate-600">
                          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-white leading-snug line-clamp-2">{p.project_name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] text-slate-400">{p.project_code}</span>
                        {p.status_label && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 ml-auto">{p.status_label}</span>
                        )}
                      </div>
                      {/* Overall progress bar */}
                      <div className="mt-1.5">
                        <div className="h-1 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${overallProgress}%`, backgroundColor: pCfg.color, opacity: 0.7 }} />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[9px] text-slate-400 truncate">{p.current_phase_name ?? "–"}</span>
                          <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 ml-1 shrink-0">{overallProgress}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Gantt timeline (fixed pixel width per week) */}
                    <div className="relative overflow-hidden" style={{ width: `${totalWidth}px`, height: "56px" }}>
                      {/* Week grid lines */}
                      {weekCols.map((wc, i) => (
                        <div
                          key={i}
                          className={`absolute top-0 bottom-0 border-r ${wc.isFirstOfMonth ? "border-slate-300/50 dark:border-white/10" : "border-slate-100/60 dark:border-white/4"}`}
                          style={{ left: `${i * WEEK_W}px`, width: `${WEEK_W}px` }}
                        />
                      ))}

                      {/* Today line */}
                      <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10" style={{ left: `${todayPx}px` }} />

                      {/* Phase segments */}
                      {segments.map(seg => {
                        const active = isPhaseActive(seg.key, p.current_phase_code);
                        const left = (seg.offsetPct / 100) * totalWidth;
                        const width = Math.max(4, (seg.widthPct / 100) * totalWidth);
                        return (
                          <div
                            key={seg.key}
                            className="absolute rounded overflow-hidden cursor-pointer transition-all duration-150"
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                              top: "14px",
                              height: "24px",
                              backgroundColor: seg.color,
                              opacity: active ? 1 : 0.38,
                              outline: active ? `2px solid ${seg.color}` : "none",
                              outlineOffset: "1px",
                              zIndex: active ? 5 : 1,
                              filter: tooltip?.seg.key === seg.key && tooltip?.project.id === p.id
                                ? "brightness(1.25) drop-shadow(0 4px 8px rgba(0,0,0,0.35))"
                                : "none",
                              transform: tooltip?.seg.key === seg.key && tooltip?.project.id === p.id
                                ? "scaleY(1.18)"
                                : "scaleY(1)",
                            }}
                            onMouseMove={e => {
                              setTooltip({ seg, project: p, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {seg.key === "handover" ? (
                              <>
                                <div className="absolute inset-0 bg-white/15" />
                                {width > 20 && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                                    ✓ Done
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="absolute left-0 top-0 h-full" style={{ width: `${seg.progress}%`, backgroundColor: "rgba(255,255,255,0.22)" }} />
                                {width > 28 && (
                                  <span className="absolute inset-0 flex items-center px-1.5 text-[8px] font-bold text-white truncate">
                                    {seg.label.split(" ").map(w => w[0]).join("")}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expanded phase detail */}
                  {isExpanded && (
                    <div className="flex border-t border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/2">
                      <div className="sticky left-0 z-10 shrink-0 w-60 border-r border-slate-200/40 dark:border-white/5 bg-slate-50/95 dark:bg-zinc-900/95" />
                      <div className="flex-1 px-4 py-3 overflow-x-auto" style={{ width: `${totalWidth}px` }}>
                        <div className="grid grid-cols-5 gap-2 min-w-[480px]">
                          {PHASES.map(ph => {
                            const seg = segments.find(s => s.key === ph.key);
                            const active = isPhaseActive(ph.key, p.current_phase_code);
                            return (
                              <div key={ph.key}
                                className="rounded-lg p-2 border"
                                style={{ borderColor: active ? ph.color : "rgba(148,163,184,0.2)", backgroundColor: active ? `${ph.color}10` : undefined }}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ph.color }} />
                                  <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 truncate">{ph.label}</span>
                                  {active && <span className="ml-auto text-[8px] font-bold px-1 rounded" style={{ color: ph.color, backgroundColor: `${ph.color}20` }}>ACTIVE</span>}
                                </div>
                                {seg ? (
                                  <div className="space-y-1 text-[9px] text-slate-500 dark:text-slate-400">
                                    <div>📅 {format(seg.start, "dd MMM yy")}</div>
                                    <div>→ {format(seg.end, "dd MMM yy")}</div>
                                    <div className="flex items-center gap-1 mt-1">
                                      <div className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-white/10">
                                        <div className="h-full rounded-full" style={{ width: `${seg.progress}%`, backgroundColor: ph.color }} />
                                      </div>
                                      <span className="font-semibold text-slate-600 dark:text-slate-300">{seg.progress}%</span>
                                    </div>
                                    {ph.key === "pm" && p.deviation_days !== null && (
                                      <div className={p.deviation_days > 0 ? "text-rose-500 font-semibold" : "text-green-500 font-semibold"}>
                                        {p.deviation_days > 0 ? `⚠ +${p.deviation_days}d delay` : `✓ ${Math.abs(p.deviation_days)}d ahead`}
                                      </div>
                                    )}
                                    {ph.key === "pm" && p.current_site_progress && (
                                      <div className="text-slate-400 truncate" title={p.current_site_progress}>{p.current_site_progress}</div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-slate-300 dark:text-slate-600 italic">No data</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {p.phase_contract_amount && (
                            <span className="text-[10px] text-slate-400">💰 Rp {Number(p.phase_contract_amount).toLocaleString("id-ID")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </div>{/* end scrollable body */}
      </div>{/* end gantt card */}

      {/* ── Floating Tooltip — cursor-tracked, full params ── */}
      {tooltip && (() => {
        const { seg, project: pr, x, y } = tooltip;
        const pCfg = PRIORITY_CONFIG[pr.priority_code ?? ""] ?? { label: pr.priority_name ?? "–", color: "#94a3b8", dot: "bg-slate-400" };
        const fd = (d: string | null) => d ? format(new Date(d), "dd MMM yyyy") : null;

        // Build param rows per phase
        type Row = { label: string; value: string | null };
        const rows: Row[] = [];
        if (seg.key === "brief") {
          rows.push(
            { label: "Received",  value: fd(pr.brief_received) },
            { label: "Deadline",  value: fd(pr.brief_deadline) },
            { label: "Progress",  value: `${pr.brief_progress ?? 0}%` },
          );
        } else if (seg.key === "design") {
          rows.push(
            { label: "Design Start",    value: fd(pr.design_start) },
            { label: "Design Approval", value: fd(pr.design_end) },
            { label: "Progress",        value: `${pr.design_progress ?? 0}%` },
            { label: "Drawing Status",  value: pr.working_drawing_status },
          );
        } else if (seg.key === "control") {
          rows.push(
            { label: "Tender Start",    value: fd(pr.control_start) },
            { label: "SPK Released",    value: fd(pr.control_end) },
            { label: "Contract Amt",    value: pr.phase_contract_amount ? `Rp ${Number(pr.phase_contract_amount).toLocaleString("id-ID")}` : null },
            { label: "Progress",        value: `${pr.control_progress ?? 0}%` },
          );
        } else if (seg.key === "pm") {
          rows.push(
            { label: "Commence",     value: fd(pr.pm_start) },
            { label: "End Contract", value: fd(pr.pm_end) },
            { label: "Deviation",    value: pr.deviation_days !== null ? (pr.deviation_days > 0 ? `+${pr.deviation_days} days (DELAY)` : `${pr.deviation_days} days (AHEAD)`) : null },
            { label: "Site Progress",value: pr.current_site_progress },
            { label: "Progress",     value: `${pr.pm_progress ?? 0}%` },
          );
        } else if (seg.key === "handover") {
          rows.push(
            { label: "BAST-1",         value: fd(pr.handover_start) },
            { label: "BAST-2",         value: fd(pr.handover_end) },
            { label: "Completion",     value: fd(pr.actual_phase_completion_date) },
            { label: "Status",         value: "✓ Done" },
          );
        }

        // Smart positioning: flip if near bottom/right of viewport
        const TIP_W = 260;
        const TIP_H = 60 + rows.length * 20;
        const flipX = x + TIP_W / 2 > window.innerWidth - 8;
        const flipY = y - TIP_H - 16 < 8;
        const left = flipX ? x - TIP_W + 16 : x - TIP_W / 2;
        const top  = flipY ? y + 16 : y - TIP_H - 16;

        return (
          <div
            className="fixed z-[999] pointer-events-none"
            style={{ left, top, width: TIP_W }}
          >
            <div
              className="rounded-2xl shadow-2xl border overflow-hidden"
              style={{
                backgroundColor: "rgba(15,20,30,0.97)",
                borderColor: `${seg.color}60`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${seg.color}30`,
                animation: "tooltipIn 0.18s cubic-bezier(0.34,1.4,0.64,1) forwards",
              }}
            >
              {/* Header bar */}
              <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: `${seg.color}22`, borderBottom: `1px solid ${seg.color}30` }}>
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: seg.color }}>{seg.label}</span>
                <span className="ml-auto text-[9px] font-bold" style={{ color: pCfg.color }}>● {pCfg.label}</span>
              </div>
              {/* Project name */}
              <div className="px-3 pt-2 pb-1">
                <p className="text-[11px] font-semibold text-white leading-tight">{pr.project_name}</p>
                <p className="text-[9px] text-white/40 mt-0.5">{pr.project_code} · {pr.status_label ?? ""}</p>
              </div>
              {/* Divider */}
              <div className="mx-3 my-1 h-px" style={{ backgroundColor: `${seg.color}25` }} />
              {/* Params */}
              <div className="px-3 pb-3 space-y-1.5">
                {/* Date range always first */}
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-white/40 w-16 shrink-0">Duration</span>
                  <span className="text-white/80 font-medium">{format(seg.start, "dd MMM yy")} → {format(seg.end, "dd MMM yy")}</span>
                </div>
                {rows.filter(r => r.value).map(r => (
                  <div key={r.label} className="flex items-start gap-1.5 text-[10px]">
                    <span className="text-white/40 w-16 shrink-0">{r.label}</span>
                    <span className={`font-medium ${
                      r.label === "Deviation" && r.value?.includes("DELAY") ? "text-rose-400" :
                      r.label === "Deviation" && r.value?.includes("AHEAD") ? "text-green-400" :
                      "text-white/85"
                    }`}>{r.value}</span>
                  </div>
                ))}
                {/* Progress bar / Done badge */}
                {seg.key === "handover" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-bold text-green-400">✓ Handover Complete</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${seg.progress}%`, backgroundColor: seg.color }} />
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: seg.color }}>{seg.progress}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: scale(0.9) translateY(4px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>

      {/* ── S-Curve Charts ── */}
      <SCurveCharts projects={filtered as any} />
    </div>
  );
}
