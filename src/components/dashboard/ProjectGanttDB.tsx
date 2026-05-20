"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, addDays, isValid, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth } from "date-fns";
import { Search, ArrowRight } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import AnimatedDropdown from "./AnimatedDropdown";
import QuickMenu from "./QuickMenu";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(/(?:^|;\s*)user_role=([^;]+)/);
  return match ? match[1].trim() : "admin";
}

function getUserIdFromCookie(): string {
  if (typeof document === "undefined") return "default";
  const match = document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/);
  return match ? match[1].trim() : "default";
}

function dateRangeKey(): string {
  return `gantt_dateRange_${getUserIdFromCookie()}`;
}

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
  scurve_target_progress: string | null;
  scurve_actual_progress: string | null;
  scurve_progress_variance: string | null;
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
  operational_brief: string | null;
  budget_capex: string | null;
  brief_pic: string | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: string | null;
  design_duration_days: number | null;
  design_brief: string | null;
  design_pic: string | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: string | null;
  project_control_duration_days: number | null;
  control_pic: string | null;
  phase_contract_amount: string | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_progress: string | null;
  pm_pic: string | null;
  deviation_days: number | null;
  current_site_progress: string | null;
  pm_remarks: string | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: string | null;
  handover_pic: string | null;
  actual_phase_completion_date: string | null;
  working_drawing_status: string | null;
  unit_name: string | null;
  unit_code: string | null;
  category_code: string | null;
  category_name: string | null;
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

type BarTooltipSegment = Pick<PhaseSegment, "label" | "color" | "start" | "end"> & { key: string };

type PhaseDateInfo = {
  key: PhaseKey;
  label: string;
  color: string;
  start: Date | null;
  end: Date | null;
  progress: number;
  pic?: string | null;
};

type WeekCol = { start: Date; end: Date; weekNum: number; monthLabel: string; isFirstOfMonth: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isValid(d) ? d : null;
}

const PHASE_CODE_MAP: Record<string, PhaseKey> = {
  operational_brief: "brief", design: "design",
  project_control: "control", project_management: "pm", handover: "handover",
};

function buildSegments(p: DBProject, timelineStart: Date, totalDays: number): PhaseSegment[] {
  const projectStart = toDate(p.start_date) ?? timelineStart;

  const raw: { key: PhaseKey; start: Date | null; end: Date | null; progress: number }[] = [
    { key: "brief",    start: toDate(p.brief_received),  end: toDate(p.brief_deadline), progress: Number(p.brief_progress ?? 100) },
    { key: "design",   start: toDate(p.design_start),    end: toDate(p.design_end),     progress: Number(p.design_progress ?? 50) },
    { key: "control",  start: toDate(p.control_start),   end: toDate(p.control_end),    progress: Number(p.control_progress ?? 50) },
    { key: "pm",       start: toDate(p.pm_start),        end: toDate(p.pm_end),         progress: Number(p.pm_progress ?? 50) },
    { key: "handover", start: toDate(p.handover_start),  end: toDate(p.handover_end),   progress: Number(p.handover_progress ?? 20) },
  ];

  let previousVisualEnd: Date | null = null;

  return raw.flatMap(r => {
    if (r.start === null && r.end === null) return [];
    const s = r.start ?? projectStart;
    const e = r.end   ?? addDays(s, 14);
    if (e < s) return [];

    // Gantt lifecycle bars are linear by phase order.
    // If a later phase is entered with dates that overlap the previous phase,
    // keep the previous phase visible and place the later phase after it visually
    // instead of letting the active phase cover/replace the earlier segment.
    let visualStart = s;
    let visualEnd = e;
    if (previousVisualEnd && visualStart <= previousVisualEnd) {
      visualStart = addDays(previousVisualEnd, 1);
    }
    if (visualEnd < visualStart) visualEnd = visualStart;
    previousVisualEnd = visualEnd;

    const offsetDays = differenceInCalendarDays(visualStart, timelineStart);
    const widthDays  = Math.max(1, differenceInCalendarDays(visualEnd, visualStart) + 1);
    const offsetPct  = Math.max(0, (offsetDays / totalDays) * 100);
    const widthPct   = Math.max(0.3, (widthDays / totalDays) * 100);
    const ph = PHASES.find(ph => ph.key === r.key)!;
    return [{ key: r.key, label: ph.label, color: ph.color, start: s, end: e, progress: r.progress, offsetPct, widthPct }];
  });
}

function buildProjectRangeBar(p: DBProject, timelineStart: Date, totalDays: number) {
  const start = toDate(p.start_date);
  const end = toDate(p.end_date);
  if (!start || !end || end < start) return null;

  const offsetDays = differenceInCalendarDays(start, timelineStart);
  const widthDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  return {
    start,
    end,
    offsetPct: Math.max(0, (offsetDays / totalDays) * 100),
    widthPct: Math.max(0.3, (widthDays / totalDays) * 100),
  };
}

function getProjectPhaseDates(p: DBProject): PhaseDateInfo[] {
  const dates: Record<PhaseKey, { start: Date | null; end: Date | null; progress: number; pic?: string | null }> = {
    brief:    { start: toDate(p.brief_received), end: toDate(p.brief_deadline), progress: Number(p.brief_progress ?? 0), pic: p.brief_pic },
    design:   { start: toDate(p.design_start),   end: toDate(p.design_end),     progress: Number(p.design_progress ?? 0), pic: p.design_pic },
    control:  { start: toDate(p.control_start),  end: toDate(p.control_end),    progress: Number(p.control_progress ?? 0), pic: p.control_pic },
    pm:       { start: toDate(p.pm_start),       end: toDate(p.pm_end),         progress: Number(p.pm_progress ?? 0), pic: p.pm_pic },
    handover: { start: toDate(p.handover_start), end: toDate(p.handover_end),   progress: Number(p.handover_progress ?? 0), pic: p.handover_pic },
  };
  return PHASES.map(ph => ({ ...ph, ...dates[ph.key] }));
}

function fmtRange(start: Date | null, end: Date | null): string {
  if (!start && !end) return "—";
  if (start && end) return `${format(start, "dd MMM yy")} → ${format(end, "dd MMM yy")}`;
  return start ? `${format(start, "dd MMM yy")} → —` : `— → ${format(end!, "dd MMM yy")}`;
}

function fmtSummaryDate(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd MMM yy") : "—";
}

function fmtSummaryText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function fmtSummaryMoney(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function fmtSummaryDuration(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n > 0 ? `+${n}` : String(n);
}

function projectDisplayName(p: DBProject): string {
  const parts = p.project_name.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : p.project_name;
}

function isPhaseActive(phKey: PhaseKey, phaseCode: string | null): boolean {
  if (!phaseCode) return false;
  return PHASE_CODE_MAP[phaseCode] === phKey;
}

function projectOverlapsRange(p: DBProject, rangeStart: Date | null, rangeEnd: Date | null, timelineStart: Date, totalDays: number): boolean {
  if (!rangeStart || !rangeEnd || !isValid(rangeStart) || !isValid(rangeEnd)) return true;
  const projectStart = toDate(p.start_date);
  const projectEnd = toDate(p.end_date);
  if (projectStart && projectEnd && projectStart <= rangeEnd && projectEnd >= rangeStart) return true;
  return buildSegments(p, timelineStart, totalDays).some(seg => seg.start <= rangeEnd && seg.end >= rangeStart);
}

function getPhaseCompleteness(phases: PhaseDateInfo[]) {
  const scheduled = phases.filter(ph => ph.start && ph.end).length;
  const partial = phases.filter(ph => (ph.start || ph.end) && !(ph.start && ph.end)).length;
  const missing = phases.length - scheduled - partial;
  return { scheduled, partial, missing, total: phases.length };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProjectGanttDB() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [userRole, setUserRole]             = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [phaseFilter, setPhaseFilter]       = useState("ALL");
  const [scheduleFilter, setScheduleFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(dateRangeKey()) : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    const current = new Date();
    return { start: format(startOfMonth(current), "yyyy-MM-dd"), end: format(endOfMonth(current), "yyyy-MM-dd") };
  });
  const [rangeMode, setRangeMode] = useState<"highlight" | "filter">("highlight");

  const handleDateRangeChange = (range: { start: string; end: string }) => {
    setDateRange(range);
    try { localStorage.setItem(dateRangeKey(), JSON.stringify(range)); } catch { /* ignore */ }
  };
  const [unitFilter, setUnitFilter]         = useState<string>("");
  const [tooltip, setTooltip] = useState<{
    seg: BarTooltipSegment; project: DBProject; phases: PhaseDateInfo[]; x: number; y: number;
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
    setUserRole(getRoleFromCookie());
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const unitOptions = useMemo(() => {
    const units = Array.from(new Set(projects.map(p => p.unit_code).filter(Boolean))).sort() as string[];
    return [
      { value: "", label: "All Units" },
      ...units.map(u => ({ value: u, label: u })),
    ];
  }, [projects]);


  // Date range bounds
  const rangeStart = useMemo(() => dateRange.start ? new Date(dateRange.start) : null, [dateRange.start]);
  const rangeEnd   = useMemo(() => dateRange.end   ? new Date(dateRange.end)   : null, [dateRange.end]);


  // Timeline: always spans full year(s) based on project dates — date range never crops the ruler.
  const timeline = useMemo(() => {
    const allDates: Date[] = [];
    for (const p of projects) {
      [p.brief_received, p.brief_deadline, p.design_start, p.design_end,
       p.control_start, p.control_end, p.pm_start, p.pm_end,
       p.handover_start, p.handover_end, p.start_date, p.end_date]
        .map(toDate).filter((d): d is Date => d !== null).forEach(d => allDates.push(d));
    }

    let s: Date;
    let e: Date;
    if (allDates.length === 0) {
      const y = new Date().getFullYear();
      s = new Date(y, 0, 1);
      e = new Date(y, 11, 31);
    } else {
      const minT = Math.min(...allDates.map(d => d.getTime()));
      const maxT = Math.max(...allDates.map(d => d.getTime()));
      s = new Date(new Date(minT).getFullYear(), 0, 1);
      e = new Date(new Date(maxT).getFullYear(), 11, 31);
    }

    const snappedStart = startOfWeek(s, { weekStartsOn: 1 });
    return {
      start: snappedStart < s ? s : snappedStart,
      end:   endOfWeek(e, { weekStartsOn: 1 }),
    };
  }, [projects]);

  // Ruler overlay positions for the selected date range
  const rangeRulers = useMemo(() => {
    if (!rangeStart || !rangeEnd || !isValid(rangeStart) || !isValid(rangeEnd)) return null;
    const days = differenceInCalendarDays(timeline.end, timeline.start) || 1;
    const sPct = Math.max(0, Math.min(100, (differenceInCalendarDays(rangeStart, timeline.start) / days) * 100));
    const ePct = Math.max(0, Math.min(100, (differenceInCalendarDays(rangeEnd, timeline.start) / days) * 100));
    return { startPct: sPct, endPct: ePct, startLabel: format(rangeStart, "dd MMM"), endLabel: format(rangeEnd, "dd MMM") };
  }, [rangeStart, rangeEnd, timeline]);

  const totalDays = useMemo(() =>
    Math.max(1, differenceInCalendarDays(timeline.end, timeline.start) + 1),
    [timeline]
  );

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = [p.project_name, p.project_code, p.status_label, p.current_phase_name, p.unit_code, p.unit_name]
        .join(" ").toLowerCase().includes(search.toLowerCase());
      const matchPriority = priorityFilter === "ALL" || p.priority_code      === priorityFilter;
      const matchPhase    = phaseFilter    === "ALL" || p.current_phase_code === phaseFilter;
      const matchUnit     = !unitFilter || p.unit_code === unitFilter;
      const matchRange    = rangeMode === "highlight" || projectOverlapsRange(p, rangeStart, rangeEnd, timeline.start, totalDays);
      const completeness  = getPhaseCompleteness(getProjectPhaseDates(p));
      const matchSchedule = scheduleFilter === "ALL"
        || (scheduleFilter === "MISSING" && completeness.missing > 0)
        || (scheduleFilter === "COMPLETE" && completeness.scheduled === completeness.total);
      return matchSearch && matchPriority && matchPhase && matchUnit && matchRange && matchSchedule;
    });
  }, [projects, search, priorityFilter, phaseFilter, unitFilter, scheduleFilter, rangeMode, rangeStart, rangeEnd, timeline, totalDays]);

  // Build week columns
  const weekCols = useMemo<WeekCol[]>(() => {
    const cols: WeekCol[] = [];
    let cursor = timeline.start;
    let monthWeekNum = 1;
    let prevMonth = -1;
    while (cursor <= timeline.end) {
      const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      const isFirst = cursor.getMonth() !== prevMonth;
      if (isFirst) monthWeekNum = 1;
      
      cols.push({
        start: cursor,
        end: wEnd,
        weekNum: monthWeekNum,
        monthLabel: format(cursor, "MMM"),
        isFirstOfMonth: isFirst,
      });
      prevMonth = cursor.getMonth();
      cursor = addWeeks(cursor, 1);
      monthWeekNum++;
    }
    return cols;
  }, [timeline]);

  // Group week cols by month for the month header row
  const monthGroups = useMemo(() => {
    const groups: { label: string; colSpan: number }[] = [];
    for (const wc of weekCols) {
      if (wc.isFirstOfMonth) {
        groups.push({ label: format(wc.start, "MMM yyyy"), colSpan: 1 });
      } else {
        groups[groups.length - 1].colSpan++;
      }
    }
    return groups;
  }, [weekCols]);

  const todayOffsetPct = useMemo(() => {
    const today = new Date();
    if (today < timeline.start) return 0;
    if (today > timeline.end) return 100;
    return (differenceInCalendarDays(today, timeline.start) / totalDays) * 100;
  }, [timeline, totalDays]);

  const rangeSummary = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    let totalActiveProjects = 0;

    filteredProjects.forEach(p => {
      const projectStart = toDate(p.start_date);
      const projectEnd = toDate(p.end_date);
      const segs = buildSegments(p, timeline.start, totalDays);
      const hasProjectOverlap = !!(projectStart && projectEnd && projectStart <= rangeEnd && projectEnd >= rangeStart);
      const hasSegmentOverlap = segs.some(s => s.start <= rangeEnd && s.end >= rangeStart);
      if (hasProjectOverlap || hasSegmentOverlap) totalActiveProjects++;
    });

    return { totalActiveProjects };
  }, [filteredProjects, rangeStart, rangeEnd, timeline, totalDays]);

  const summaryGroups = useMemo(() => {
    const groups = new Map<string, DBProject[]>();
    for (const project of filteredProjects) {
      const key = project.unit_code || project.unit_name || "—";
      const list = groups.get(key) ?? [];
      list.push(project);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([unit, rows]) => ({ unit, rows }));
  }, [filteredProjects]);

  const WEEK_W = 36; // px per week column
  const totalWidth = weekCols.length * WEEK_W; // total gantt width in px

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
    <div className="space-y-3 relative overflow-x-hidden" ref={containerRef}>
      {/* Controls: search + ongoing badge + details | datepicker | phase | priority | unit */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search + ongoing count + details button */}
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <label className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project, phase, status..."
              className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white"
            />
          </label>
          <span className="shrink-0 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {rangeSummary ? rangeSummary.totalActiveProjects : 0} ongoing
          </span>
          <button
            disabled={!rangeSummary}
            onClick={() => {
              if (!rangeSummary) return;
              const qs = new URLSearchParams({ start: dateRange.start, end: dateRange.end });
              router.push(`/dashboard/projects/list?${qs.toString()}`);
            }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
              rangeSummary
                ? "bg-cyan-500 hover:bg-cyan-400 text-white shadow-sm shadow-cyan-500/20 cursor-pointer"
                : "bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            Details <ArrowRight size={11} />
          </button>
        </div>
        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        <AnimatedDropdown
          value={rangeMode}
          onChange={(value) => setRangeMode(value as "highlight" | "filter")}
          options={[
            { value: "highlight", label: "Highlight Range" },
            { value: "filter", label: "Filter by Range" },
          ]}
          minWidth={150}
        />
        <AnimatedDropdown
          value={phaseFilter}
          onChange={setPhaseFilter}
          options={[
            { value: "ALL",                  label: "All Phases" },
            { value: "operational_brief",    label: "Operational Brief" },
            { value: "design",               label: "Design" },
            { value: "project_control",      label: "Project Control" },
            { value: "project_management",   label: "Project Management" },
            { value: "handover",             label: "Handover" },
          ]}
          minWidth={160}
        />
        <AnimatedDropdown
          value={scheduleFilter}
          onChange={setScheduleFilter}
          options={[
            { value: "ALL", label: "All Schedules" },
            { value: "MISSING", label: "Missing Phase Dates" },
            { value: "COMPLETE", label: "Complete Phase Dates" },
          ]}
          minWidth={170}
        />
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
          minWidth={148}
        />
        <AnimatedDropdown
          value={unitFilter}
          onChange={setUnitFilter}
          options={unitOptions}
          minWidth={130}
        />
        {userRole === "pm" && <QuickMenu align="right" />}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        {PHASES.map(ph => (
          <div key={ph.key} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: ph.color }} />
            {ph.label}
          </div>
        ))}
      </div>

      {/* Gantt */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm">

        {/* ── Sticky headers (outside overflow-x-auto so they stick on vertical scroll) ── */}
        <div className={`sticky ${userRole === "pm" ? "top-0" : "top-14"} z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-t-2xl border-b border-slate-200/60 dark:border-white/8`}>
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
                <div className="relative flex" style={{ width: `${totalWidth}px` }}>
                  {weekCols.map((wc, i) => {
                    const isLastOfMonth = i < weekCols.length - 1 && weekCols[i + 1].isFirstOfMonth;
                    return (
                      <div
                        key={i}
                        className={`text-center text-[9px] py-1 border-r shrink-0 ${
                          isLastOfMonth
                            ? "border-slate-300/60 dark:border-white/12"
                            : "border-slate-100/70 dark:border-white/5"
                        } ${wc.isFirstOfMonth ? "font-bold text-slate-500 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`}
                        style={{ width: `${WEEK_W}px` }}
                      >
                        W{wc.weekNum}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div
          ref={bodyRef}
          className="overflow-x-auto relative bg-white/95 dark:bg-zinc-900/95"
          onScroll={onBodyScroll}
          onMouseLeave={() => setTooltip(null)}
        >
          <div style={{ minWidth: `${240 + totalWidth}px` }} className="relative">

            {/* Continuous Vertical Lines Overlay */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: "240px", width: `${totalWidth}px`, zIndex: 10 }}>
              {/* Today line */}
              <div className="absolute top-0 bottom-0 border-l-[3px] border-dashed border-red-500/90" style={{ left: `${(todayOffsetPct / 100) * totalWidth}px` }} />

              {/* Date range overlay block */}
              {rangeRulers && (
                <div
                  className="absolute top-0 bottom-0 z-0 pointer-events-none border-t-[3px] border-cyan-400 bg-cyan-400/10"
                  style={{
                    left: `${(rangeRulers.startPct / 100) * totalWidth}px`,
                    width: `${((rangeRulers.endPct - rangeRulers.startPct) / 100) * totalWidth}px`,
                  }}
                />
              )}

            </div>

            {/* Project rows */}
            {filteredProjects.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                No projects match your filter.
              </div>
            ) : filteredProjects.map(p => {
              const segments = buildSegments(p, timeline.start, totalDays);
              const phaseDates = getProjectPhaseDates(p);
              const phaseCompleteness = getPhaseCompleteness(phaseDates);
              const projectRangeBar = buildProjectRangeBar(p, timeline.start, totalDays);
              const overallProgress = Number(p.overall_progress_pct ?? 0);
              const pCfg = PRIORITY_CONFIG[p.priority_code ?? ""] ?? { label: p.priority_name ?? "–", color: "#94a3b8", dot: "bg-slate-400" };

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
                >
                  {/* Row */}
                  <div
                    className="flex items-center hover:bg-slate-50/70 dark:hover:bg-white/3 transition-colors"
                  >
                    {/* Left: project info — sticky on horizontal scroll */}
                    <div
                      className={`sticky left-0 z-10 shrink-0 w-60 px-3 py-2.5 border-r border-slate-200/40 dark:border-white/5 ${
                        isActiveToday
                          ? "bg-cyan-50/90 dark:bg-cyan-900/40"
                          : "bg-white/95 dark:bg-zinc-900/95"
                      }`}
                      style={isActiveToday ? { borderLeft: `3px solid ${activeTodayPhase?.color ?? "#06b6d4"}` } : {}}
                    >
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
                      </div>
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-white leading-snug line-clamp-2">
                        {p.unit_code ? `${p.unit_code} - ${p.project_name.split(" - ").slice(1).join(" - ") || p.project_name}` : p.project_name}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-[9px] text-slate-400 truncate block">{p.current_phase_name ?? "–"}</span>
                        {p.scurve_target_progress !== null && (
                          <span
                            className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                              Number(p.scurve_progress_variance ?? 0) < 0
                                ? "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20"
                                : "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                            }`}
                            title={`S-Curve Target ${Number(p.scurve_target_progress ?? 0).toFixed(2)}% / Actual ${Number(p.scurve_actual_progress ?? 0).toFixed(2)}%`}
                          >
                            T {Number(p.scurve_target_progress ?? 0).toFixed(0)} / A {Number(p.scurve_actual_progress ?? 0).toFixed(0)}
                          </span>
                        )}
                        <span
                          className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                            phaseCompleteness.missing > 0
                              ? "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20"
                              : "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                          }`}
                          title={`${phaseCompleteness.scheduled}/${phaseCompleteness.total} phases scheduled`}
                        >
                          {phaseCompleteness.scheduled}/{phaseCompleteness.total}
                        </span>
                      </div>
                    </div>

                    {/* Right: Gantt timeline (fixed pixel width per week) */}
                    <div className="relative overflow-hidden" style={{ width: `${totalWidth}px`, height: "56px" }}>
                      {/* Week grid lines */}
                      {weekCols.map((_wc, i) => {
                        const isLastOfMonth = i < weekCols.length - 1 && weekCols[i + 1].isFirstOfMonth;
                        return (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-r ${isLastOfMonth ? "border-slate-300/50 dark:border-white/10" : "border-slate-100/60 dark:border-white/4"}`}
                            style={{ left: `${i * WEEK_W}px`, width: `${WEEK_W}px` }}
                          />
                        );
                      })}

                      {/* Empty project range bar first: visual field/container for all phase segments */}
                      {projectRangeBar && (() => {
                        const left = (projectRangeBar.offsetPct / 100) * totalWidth;
                        const width = Math.max(4, (projectRangeBar.widthPct / 100) * totalWidth);
                        const isHovered = tooltip?.project.id === p.id;
                        return (
                          <div
                            className="absolute rounded-full border border-slate-300/80 bg-slate-200/80 dark:border-white/10 dark:bg-white/12 shadow-inner cursor-pointer overflow-hidden transition-all duration-150 hover:ring-2 hover:ring-cyan-400/50"
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                              top: "14px",
                              height: "24px",
                              zIndex: 3,
                              filter: isHovered ? "brightness(1.12) drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "none",
                              transform: isHovered ? "scaleY(1.12)" : "scaleY(1)",
                            }}
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") router.push(`/dashboard/projects/${p.id}`);
                            }}
                            onMouseMove={e => {
                              setTooltip({
                                seg: {
                                  key: "project-range",
                                  label: "Project Date Range",
                                  color: "#94a3b8",
                                  start: projectRangeBar.start,
                                  end: projectRangeBar.end,
                                },
                                project: p,
                                phases: phaseDates,
                                x: e.clientX,
                                y: e.clientY,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {segments.map(seg => {
                              const active = isPhaseActive(seg.key, p.current_phase_code);
                              const segLeft = ((seg.offsetPct - projectRangeBar.offsetPct) / 100) * totalWidth;
                              const segWidth = Math.max(2, (seg.widthPct / 100) * totalWidth);
                              const clippedLeft = Math.max(0, segLeft);
                              const clippedWidth = Math.max(0, Math.min(segWidth, width - clippedLeft));
                              if (clippedWidth <= 0) return null;
                              return (
                                <div
                                  key={seg.key}
                                  className="absolute top-0 bottom-0"
                                  style={{
                                    left: `${clippedLeft}px`,
                                    width: `${clippedWidth}px`,
                                    backgroundColor: seg.color,
                                    opacity: active ? 1 : 0.52,
                                    boxShadow: active ? `inset 0 0 0 2px ${seg.color}, inset 0 0 0 3px rgba(255,255,255,0.28)` : "none",
                                  }}
                                >
                                  <div className="absolute left-0 top-0 h-full" style={{ width: `${seg.progress}%`, backgroundColor: "rgba(255,255,255,0.18)" }} />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                </div>
              );
            })}

          </div>
        </div>{/* end scrollable body */}
      </div>{/* end gantt card */}

      {/* ── Excel-style Project Summary Matrix ───────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/70 dark:bg-zinc-900/55 backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200/60 dark:border-white/8 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wide">Project Summary Matrix</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Excel-style phase parameters sourced from the same Gantt data</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">
            {filteredProjects.length} projects
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
          <table className="min-w-[2200px] w-full border-collapse text-[10px] text-slate-700 dark:text-slate-200">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-zinc-900 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th rowSpan={2} className="sticky left-0 z-20 w-20 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left">Unit</th>
                <th rowSpan={2} className="w-12 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">No</th>
                <th rowSpan={2} className="w-72 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 text-left">Description</th>
                <th colSpan={3} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-slate-200/70 dark:bg-zinc-800/80">Operational Brief (PR)</th>
                <th colSpan={5} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-blue-100/70 dark:bg-blue-950/30">Design (HoD)</th>
                <th colSpan={4} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-amber-100/80 dark:bg-amber-950/30">Project Control</th>
                <th colSpan={6} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-teal-100/70 dark:bg-teal-950/30">Project Management Team</th>
                <th colSpan={2} className="border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-emerald-100/70 dark:bg-emerald-950/30">Handover</th>
              </tr>
              <tr className="bg-white dark:bg-zinc-950 text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {["Brief", "Received Date", "Budget / CAPEX", "Start Design Date", "Design Approval (+1 month)", "Duration: delay(-) / +", "Brief", "Working Drawing (+3 weeks)", "Tender Start", "APS = SPK Released (+3 weeks)", "Duration: delay(-) / +", "Contract Amount", "Commence Date", "End Contract", "Actual Completion", "Deviation: delay(-) / +", "Current Site Progress", "Remarks", "BAST-1", "BAST-2"].map((label, idx) => (
                  <th key={`${label}-${idx}`} className="min-w-28 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 align-bottom leading-tight text-left last:border-r-0">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryGroups.length === 0 ? (
                <tr>
                  <td colSpan={23} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">No projects match your filter.</td>
                </tr>
              ) : summaryGroups.map(group => group.rows.map((project, idx) => (
                <tr key={project.id} className="odd:bg-white/70 even:bg-slate-50/70 dark:odd:bg-zinc-950/20 dark:even:bg-zinc-900/30 hover:bg-cyan-50/70 dark:hover:bg-cyan-950/20 transition-colors">
                  {idx === 0 && (
                    <td rowSpan={group.rows.length} className="sticky left-0 z-10 border-r border-b border-slate-200 dark:border-white/10 bg-inherit px-2 py-2 font-extrabold text-slate-700 dark:text-white align-top">
                      {group.unit}
                    </td>
                  )}
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 text-center font-mono text-slate-500">{project.project_code || project.id}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-semibold text-slate-800 dark:text-white leading-snug">
                    {projectDisplayName(project)}
                  </td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.operational_brief)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.brief_received)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-right whitespace-nowrap">{fmtSummaryMoney(project.budget_capex)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.design_start)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.design_end)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.design_duration_days)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.design_brief)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.working_drawing_status)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.control_start)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.control_end)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.project_control_duration_days)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-right whitespace-nowrap">{fmtSummaryMoney(project.phase_contract_amount)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.pm_start)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.pm_end)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.actual_phase_completion_date)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.deviation_days)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.current_site_progress)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.pm_remarks)}</td>
                  <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.handover_start)}</td>
                  <td className="border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.handover_end)}</td>
                </tr>
              ))) }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bar tooltip — one source of truth for project/phase date ranges ── */}
      {tooltip && (() => {
        const { seg, project: pr, phases, x, y } = tooltip;
        const TIP_W  = 320;
        const TIP_H  = 285; // approximate tooltip height
        const viewportW = typeof window !== "undefined" ? window.innerWidth : 1000;
        const viewportH = typeof window !== "undefined" ? window.innerHeight : 700;
        const margin = 12;
        // Use fixed viewport coordinates and clamp to screen, so the tooltip never
        // gets pushed above the visible area or clipped by the Gantt container.
        const rawLeft = x + TIP_W + margin > viewportW ? x - TIP_W - margin : x + margin;
        const rawTop  = y + TIP_H + margin > viewportH ? y - TIP_H - margin : y + margin;
        const left = Math.max(margin, Math.min(rawLeft, viewportW - TIP_W - margin));
        const top  = Math.max(margin, Math.min(rawTop,  viewportH - TIP_H - margin));
        const displayName = pr.unit_code
          ? `${pr.unit_code} – ${pr.project_name.split(" - ").slice(1).join(" - ") || pr.project_name}`
          : pr.project_name;
        const completeness = getPhaseCompleteness(phases);
        return (
          <div className="fixed z-999 pointer-events-none" style={{ left, top, width: TIP_W }}>
            <div
              className="rounded-xl border px-3 py-2.5 shadow-xl
                bg-white dark:bg-zinc-900
                border-slate-200 dark:border-zinc-700"
              style={{
                borderColor: `${seg.color}40`,
                boxShadow: `0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px ${seg.color}20`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: seg.color }}>Project Lifecycle</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-800 dark:text-white leading-snug mb-1.5 line-clamp-2">{displayName}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 dark:text-white/55 mb-2">
                <p>Range: <span className="font-semibold text-slate-600 dark:text-white/75">{format(seg.start, "dd MMM yy")} → {format(seg.end, "dd MMM yy")}</span></p>
                <p className="text-right">Progress: <span className="font-semibold text-slate-600 dark:text-white/75">{Number(pr.overall_progress_pct ?? 0)}%</span></p>
                {pr.scurve_target_progress !== null && (
                  <p>S-Curve: <span className="font-semibold text-slate-600 dark:text-white/75">T {Number(pr.scurve_target_progress ?? 0).toFixed(2)}% / A {Number(pr.scurve_actual_progress ?? 0).toFixed(2)}%</span></p>
                )}
                <p>Status: <span className="font-semibold text-slate-600 dark:text-white/75">{pr.status_label ?? "—"}</span></p>
                <p className={`text-right font-semibold ${completeness.missing > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                  {completeness.scheduled}/{completeness.total} phases scheduled
                </p>
              </div>
              <div className="space-y-1.5 border-t border-slate-200/70 dark:border-white/8 pt-2">
                {phases.map(ph => {
                  const active = isPhaseActive(ph.key, pr.current_phase_code);
                  return (
                    <div key={ph.key} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ph.color, opacity: ph.start || ph.end ? 1 : 0.35 }} />
                      <span className="w-[104px] truncate font-semibold text-slate-600 dark:text-white/70">
                        {ph.label}{active ? " • current" : ""}
                      </span>
                      <span className="flex-1 text-right font-mono text-slate-500 dark:text-white/55">
                        {fmtRange(ph.start, ph.end)}
                        <span className="block font-sans text-[9px] text-slate-400 dark:text-white/40 truncate">
                          {ph.pic ? `PIC: ${ph.pic}` : `Progress: ${ph.progress || 0}%`}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
