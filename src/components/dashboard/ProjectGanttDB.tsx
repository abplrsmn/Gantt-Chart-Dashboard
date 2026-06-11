"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, addDays, isValid, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth } from "date-fns";
import { Search, ArrowRight, MousePointer2, Move, Trash2, Plus, CalendarRange } from "lucide-react";
import DateRangePicker from "./DateRangePicker";
import AnimatedDropdown from "./AnimatedDropdown";
import QuickMenu from "./QuickMenu";
import AddProjectModal from "./AddProjectModal";

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

const PHASE_DRAG_FIELDS: Record<PhaseKey, { start: string; end: string }> = {
  brief:    { start: "brief_received", end: "brief_deadline" },
  design:   { start: "design_start",   end: "design_end" },
  control:  { start: "control_start",  end: "control_end" },
  pm:       { start: "pm_start",       end: "pm_end" },
  handover: { start: "handover_start", end: "handover_end" },
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
  status_color: string | null;
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

type DragMode = "move" | "resize-left" | "resize-right";
type ActiveDrag = {
  projectId: string;
  phaseKey: PhaseKey;
  mode: DragMode;
  startMouseX: number;
  origStart: Date;
  origEnd: Date;
  currentStart: Date;
  currentEnd: Date;
  barEl: HTMLElement;
  timelineStart: Date;
  totalDays: number;
  totalWidth: number;
  pixelsPerDay: number;
};

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
    const ph = PHASES.find(ph => ph.key === r.key);
    if (!ph) return [];
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


function isPhaseActive(phKey: PhaseKey, phaseCode: string | null): boolean {
  if (!phaseCode) return false;
  return PHASE_CODE_MAP[phaseCode] === phKey;
}



// ─── Component ────────────────────────────────────────────────────────────────
export default function ProjectGanttDB() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects]       = useState<DBProject[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch]     = useState("");
  const [userRole, setUserRole]             = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState(() => {
    try { return typeof window !== "undefined" ? localStorage.getItem(`gantt_priority_${getUserIdFromCookie()}`) ?? "ALL" : "ALL"; } catch { return "ALL"; }
  });
  const [phaseFilter, setPhaseFilter] = useState(() => {
    try { return typeof window !== "undefined" ? localStorage.getItem(`gantt_phase_${getUserIdFromCookie()}`) ?? "ALL" : "ALL"; } catch { return "ALL"; }
  });

  const [statusFilter, setStatusFilter] = useState(() => {
    try { return typeof window !== "undefined" ? localStorage.getItem(`gantt_status_${getUserIdFromCookie()}`) ?? "ALL" : "ALL"; } catch { return "ALL"; }
  });
  const [statusOptions, setStatusOptions] = useState<{ value: string; label: string; color?: string }[]>([{ value: "ALL", label: "All Statuses" }]);

  const handlePriorityFilter = (v: string) => { setPriorityFilter(v); try { localStorage.setItem(`gantt_priority_${getUserIdFromCookie()}`, v); } catch { /* ignore */ } };
  const handlePhaseFilter    = (v: string) => { setPhaseFilter(v);    try { localStorage.setItem(`gantt_phase_${getUserIdFromCookie()}`, v);    } catch { /* ignore */ } };
  const handleStatusFilter   = (v: string) => { setStatusFilter(v);   try { localStorage.setItem(`gantt_status_${getUserIdFromCookie()}`, v);   } catch { /* ignore */ } };
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(dateRangeKey()) : null;
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    const current = new Date();
    const prevMonth = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    return { start: format(startOfMonth(prevMonth), "yyyy-MM-dd"), end: format(endOfMonth(current), "yyyy-MM-dd") };
  });

  const handleDateRangeChange = (range: { start: string; end: string }) => {
    setDateRange(range);
    try { localStorage.setItem(dateRangeKey(), JSON.stringify(range)); } catch { /* ignore */ }
  };
  const [tooltip, setTooltip] = useState<{
    seg: BarTooltipSegment; project: DBProject; phases: PhaseDateInfo[]; x: number; y: number;
  } | null>(null);

  // Refs for synced horizontal scroll between sticky header, top scrollbar, and body
  const headerRef    = useRef<HTMLDivElement>(null);
  const bodyRef      = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef   = useRef(false);

  const dragRef        = useRef<ActiveDrag | null>(null);
  const dragTipRef     = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [toolMode, setToolMode] = useState<"select" | "drag" | "delete">("select");
  const [rangeTooltip, setRangeTooltip] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ projectId: string; seg: PhaseSegment } | null>(null);
  const [dragConfirm, setDragConfirm]     = useState<{ projectId: string; phaseKey: PhaseKey; origStart: Date; origEnd: Date; newStart: Date; newEnd: Date } | null>(null);
  const [modalExiting, setModalExiting]   = useState(false);

  const onBodyScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const x = bodyRef.current?.scrollLeft ?? 0;
    if (headerRef.current)    headerRef.current.scrollLeft    = x;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = x;
    syncingRef.current = false;
  };

  const onTopScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const x = topScrollRef.current?.scrollLeft ?? 0;
    if (headerRef.current) headerRef.current.scrollLeft = x;
    if (bodyRef.current)   bodyRef.current.scrollLeft   = x;
    syncingRef.current = false;
  };

  function loadProjects() {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setUserRole(getRoleFromCookie());
    loadProjects();
    fetch("/api/master/options")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.statuses) {
          const opts = [
            { value: "ALL", label: "All Statuses" },
            ...d.statuses.map((s: { name: string; color: string }) => ({ value: s.name, label: s.name, color: s.color })),
          ];
          setStatusOptions(opts);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #9: clear range tooltip when date range changes to avoid stale count
  useEffect(() => { setRangeTooltip(null); }, [dateRange]);

  useEffect(() => {
    if (!dragging) return;

    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaPx   = e.clientX - drag.startMouseX;
      const deltaDays = Math.round(deltaPx / drag.pixelsPerDay);

      let newStart = drag.origStart;
      let newEnd   = drag.origEnd;

      if (drag.mode === "move") {
        newStart = addDays(drag.origStart, deltaDays);
        newEnd   = addDays(drag.origEnd,   deltaDays);
      } else if (drag.mode === "resize-left") {
        newStart = addDays(drag.origStart, deltaDays);
        if (differenceInCalendarDays(drag.origEnd, newStart) < 1) newStart = addDays(drag.origEnd, -1);
        newEnd = drag.origEnd;
      } else {
        newStart = drag.origStart;
        newEnd   = addDays(drag.origEnd, deltaDays);
        if (differenceInCalendarDays(newEnd, drag.origStart) < 1) newEnd = addDays(drag.origStart, 1);
      }

      drag.currentStart = newStart;
      drag.currentEnd   = newEnd;

      const offsetDays = differenceInCalendarDays(newStart, drag.timelineStart);
      const widthDays  = Math.max(1, differenceInCalendarDays(newEnd, newStart) + 1);
      drag.barEl.style.left  = `${(offsetDays / drag.totalDays) * drag.totalWidth}px`;
      drag.barEl.style.width = `${Math.max(6, (widthDays / drag.totalDays) * drag.totalWidth)}px`;

      // Update drag date tooltip directly (no setState to avoid re-renders)
      if (dragTipRef.current) {
        dragTipRef.current.style.left    = `${e.clientX + 12}px`;
        dragTipRef.current.style.top     = `${e.clientY - 36}px`;
        dragTipRef.current.style.display = "block";
        dragTipRef.current.textContent   = `${format(newStart, "d MMM")} – ${format(newEnd, "d MMM yyyy")}`;
      }
    }

    function onMouseUp() {
      const drag = dragRef.current;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
      setDragging(false);
      dragRef.current = null;
      if (dragTipRef.current) dragTipRef.current.style.display = "none";
      if (!drag) return;

      // Do NOT clear barEl inline styles here — clearing before React re-renders
      // causes a flash where the bar has no position. React reconciliation will
      // overwrite them naturally when the confirm dialog triggers a re-render.

      // Only show confirm if dates actually changed
      const moved = drag.currentStart.getTime() !== drag.origStart.getTime() ||
                    drag.currentEnd.getTime()   !== drag.origEnd.getTime();
      if (!moved) return;

      setDragConfirm({
        projectId: drag.projectId,
        phaseKey:  drag.phaseKey,
        origStart: drag.origStart,
        origEnd:   drag.origEnd,
        newStart:  drag.currentStart,
        newEnd:    drag.currentEnd,
      });
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);



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
    if (rangeStart > rangeEnd) return null;
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
      const matchSearch = [p.project_name, p.project_code, p.status_label, p.current_phase_name, p.unit_code, p.unit_name, p.brief_pic, p.design_pic, p.control_pic, p.pm_pic, p.handover_pic]
        .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
      const matchPriority = priorityFilter === "ALL" || p.priority_code      === priorityFilter;
      const matchPhase    = phaseFilter    === "ALL" || p.current_phase_code === phaseFilter;
      const matchStatus   = statusFilter   === "ALL" || p.status_label       === statusFilter;
      const matchRange    = true;
      return matchSearch && matchPriority && matchPhase && matchStatus && matchRange;
    });
  }, [projects, search, priorityFilter, phaseFilter, statusFilter, rangeStart, rangeEnd, timeline, totalDays]);

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


  const WEEK_W     = 56; // px per week column
  const totalWidth = weekCols.length * WEEK_W;
  const pixelsPerDay = totalWidth / Math.max(1, totalDays);

  const dateRangeScrollInit = useRef(false);
  const hasScrolledOnLoad   = useRef(false);

  function scrollToMonth(date: Date) {
    if (!bodyRef.current || pixelsPerDay <= 0) return; // #5: guard against invalid pixelsPerDay
    const target = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const offsetDays = differenceInCalendarDays(target, timeline.start);
    const scrollPx = Math.max(0, offsetDays * pixelsPerDay);
    bodyRef.current.scrollLeft = scrollPx;
    if (headerRef.current)    headerRef.current.scrollLeft    = scrollPx;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = scrollPx;
  }

  // Auto-scroll to 1 month before the earliest project start date — fires once after projects load
  // #4: use a ref flag instead of boolean expression as dependency
  useEffect(() => {
    if (hasScrolledOnLoad.current || projects.length === 0 || !bodyRef.current) return;
    const allStarts = projects.map(p => toDate(p.start_date)).filter((d): d is Date => d !== null);
    if (allStarts.length === 0) return;
    hasScrolledOnLoad.current = true;
    const earliest = new Date(Math.min(...allStarts.map(d => d.getTime())));
    scrollToMonth(earliest);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Auto-scroll to 1 month before picked date range start when user changes the range
  useEffect(() => {
    if (!dateRangeScrollInit.current) { dateRangeScrollInit.current = true; return; }
    if (!rangeStart || pixelsPerDay <= 0) return; // #5: guard against timeline not ready
    scrollToMonth(rangeStart);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start]);

  function startDrag(
    e: React.MouseEvent,
    project: DBProject,
    seg: PhaseSegment,
    mode: DragMode,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const barEl = e.currentTarget.closest<HTMLElement>("[data-drag-bar]");
    if (!barEl) return;
    dragRef.current = {
      projectId: project.id,
      phaseKey:  seg.key,
      mode,
      startMouseX:   e.clientX,
      origStart:     seg.start,
      origEnd:       seg.end,
      currentStart:  seg.start,
      currentEnd:    seg.end,
      barEl,
      timelineStart: timeline.start,
      totalDays,
      totalWidth,
      pixelsPerDay,
    };
    setDragging(true);
    document.body.style.cursor     = mode === "move" ? "grabbing" : "ew-resize";
    document.body.style.userSelect = "none";
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-sienna)", borderTopColor: "transparent" }} />
      Loading...
    </div>
  );
  if (error) return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">❌ {error}</div>
  );

  return (
    <div className="space-y-3 relative" style={{ overflowX: "clip" }} ref={containerRef}>
      <div className="flex items-center gap-2 mb-3 mt-2">
        <CalendarRange size={16} className="text-amber-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Projects</h2>
      </div>

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
          <span
            className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors"
            style={rangeSummary && rangeSummary.totalActiveProjects > 0
              ? { color: "#92400e", background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.45)" }
              : { color: "var(--brand-mahogany)", background: "rgba(59,35,21,0.08)", border: "1px solid rgba(59,35,21,0.15)" }
            }
          >
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
                ? "text-white shadow-sm cursor-pointer glass-btn-primary"
                : "bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            Details <ArrowRight size={11} />
          </button>
        </div>
        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        <AnimatedDropdown
          value={phaseFilter}
          onChange={handlePhaseFilter}
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
          value={statusFilter}
          onChange={handleStatusFilter}
          options={statusOptions}
          minWidth={148}
        />
        <AnimatedDropdown
          value={priorityFilter}
          onChange={handlePriorityFilter}
          options={[
            { value: "ALL",      label: "All Priorities" },
            { value: "CRITICAL", label: "Critical", color: "#ef4444" },
            { value: "HIGH",     label: "High",     color: "#f97316" },
            { value: "MID",      label: "Mid",      color: "#eab308" },
            { value: "LOW",      label: "Low",      color: "#22c55e" },
          ]}
          minWidth={148}
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap border text-white glass-btn-primary"
        >
          <Plus size={13} />
          Add Project
        </button>
        {userRole === "pm" && <QuickMenu align="right" />}
      </div>

      {/* Legend + tool mode selector on the same row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          {PHASES.map(ph => (
            <div key={ph.key} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="w-3 h-2.5 rounded-sm inline-block" style={{ backgroundColor: ph.color }} />
              {ph.label}
            </div>
          ))}
        </div>

        {/* Tool mode selector */}
        <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-white/6 border border-slate-200/60 dark:border-white/8">
          {([
            { mode: "select", Icon: MousePointer2, title: "Select — click bar to open project" },
            { mode: "drag",   Icon: Move,          title: "Drag — move or resize phase bars" },
            { mode: "delete", Icon: Trash2,        title: "Delete — click bar to clear phase dates" },
          ] as const).map(({ mode, Icon, title }) => (
            <button
              key={mode}
              title={title}
              onClick={() => setToolMode(mode)}
              className={`p-2 rounded-lg transition-all ${
                toolMode === mode
                  ? mode === "delete"
                    ? "bg-rose-500 text-white shadow-sm"
                    : "bg-white dark:bg-zinc-800 shadow-sm" + " text-brand-mahogany"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Gantt */}
      <div className="rounded-2xl overflow-clip border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm">

        {/* ── Sticky headers + top scrollbar ── */}
        <div className="sticky top-0 z-30 bg-white dark:bg-zinc-900 rounded-t-2xl border-b border-slate-200/60 dark:border-white/8">

          {/* Top scrollbar strip — inside sticky so it stays visible while scrolling down */}
          <div
            ref={topScrollRef}
            className="overflow-x-auto border-b border-slate-200/40 dark:border-white/6"
            style={{ height: 18 }}
            onScroll={onTopScroll}
          >
            <div style={{ width: `${240 + totalWidth}px`, height: 1 }} />
          </div>

          {/* header scroll mirror — hidden overflow, synced via JS */}
          <div ref={headerRef} className="overflow-x-hidden">
            <div style={{ minWidth: `${240 + totalWidth}px` }}>

              {/* Month row */}
              <div className="flex border-b border-slate-200/50 dark:border-white/8">
                <div className="sticky left-0 z-20 shrink-0 w-60 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 border-r border-slate-200/60 dark:border-white/8 bg-white dark:bg-zinc-900">
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
                <div className="sticky left-0 z-20 shrink-0 w-60 border-r border-slate-200/60 dark:border-white/8 bg-white dark:bg-zinc-900" />
                <div className="relative flex" style={{ width: `${totalWidth}px` }}>
                  {weekCols.map((wc, i) => {
                    const isLastOfMonth = i < weekCols.length - 1 && weekCols[i + 1].isFirstOfMonth;
                    return (
                      <div
                        key={i}
                        className={`text-center text-[9px] py-1 border-r shrink-0 flex flex-col items-center justify-center gap-px ${
                          isLastOfMonth
                            ? "border-slate-300/60 dark:border-white/12"
                            : "border-slate-100/70 dark:border-white/5"
                        } ${wc.isFirstOfMonth ? "font-bold text-slate-500 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`}
                        style={{ width: `${WEEK_W}px` }}
                      >
                        <span>W{wc.weekNum}</span>
                        <span className="text-[8px] font-normal opacity-60">{format(wc.start, "d MMM")}</span>
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
          className="overflow-x-auto no-scrollbar relative bg-white dark:bg-zinc-900"
          onScroll={onBodyScroll}
          onMouseLeave={() => setTooltip(null)}
        >
          <div style={{ minWidth: `${240 + totalWidth}px` }} className="relative">

            {/* Date range overlay block — full height, behind rows */}
            {rangeRulers && (
              <div
                className="absolute top-0 bottom-0 border-t-[3px] cursor-default"
                style={{
                  left:        `${240 + (rangeRulers.startPct / 100) * totalWidth}px`,
                  width:       `${((rangeRulers.endPct - rangeRulers.startPct) / 100) * totalWidth}px`,
                  borderColor: "var(--brand-sand)",
                  background:  "rgba(196,149,106,0.12)",
                  zIndex:      1,
                }}
                onMouseMove={e => setRangeTooltip({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setRangeTooltip(null)}
              />
            )}

            {/* Today line — single overlay spanning full gantt body height */}
            {todayOffsetPct >= 0 && todayOffsetPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 border-l-[3px] border-dashed border-red-500/90 pointer-events-none"
                style={{ left: `${240 + (todayOffsetPct / 100) * totalWidth}px`, zIndex: 10 }}
              />
            )}

            {/* Project rows */}
            {filteredProjects.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                No projects match your filter.
              </div>
            ) : filteredProjects.map(p => {
              const segments = buildSegments(p, timeline.start, totalDays);
              const phaseDates = getProjectPhaseDates(p);
              const projectRangeBar = buildProjectRangeBar(p, timeline.start, totalDays);
              const pCfg = PRIORITY_CONFIG[p.priority_code ?? ""] ?? { label: p.priority_name ?? "–", color: "#94a3b8", dot: "bg-slate-400" };

              // Is any phase running today?
              const today = new Date();
              const isActiveToday = segments.some(s => today >= s.start && today <= s.end);
              const activeTodayPhase = segments.find(s => today >= s.start && today <= s.end);

              // Does this project overlap the selected date range?
              const projStart = toDate(p.start_date);
              const projEnd   = toDate(p.end_date);
              const isInRange = !!(rangeStart && rangeEnd && (
                segments.some(s => s.start <= rangeEnd && s.end >= rangeStart) ||
                (projStart && projEnd && projStart <= rangeEnd && projEnd >= rangeStart)
              ));

              return (
                <div
                  key={p.id}
                  className={`border-b border-slate-100/80 dark:border-white/4 last:border-0 ${
                    isActiveToday ? "bg-cyan-50/30 dark:bg-cyan-900/10"
                    : isInRange   ? "bg-amber-50/40 dark:bg-amber-900/10"
                    : "bg-white dark:bg-zinc-900"
                  }`}
                >
                  {/* Row */}
                  <div
                    className="flex items-center hover:bg-slate-50/70 dark:hover:bg-white/3 transition-colors"
                  >
                    {/* Left: project info — sticky on horizontal scroll */}
                    <div
                      className={`sticky left-0 z-20 shrink-0 w-60 h-22 px-3 flex flex-col justify-center overflow-hidden border-r border-slate-200/40 dark:border-white/5 ${
                        isActiveToday ? "bg-cyan-50 dark:bg-cyan-950"
                        : isInRange   ? "bg-amber-50 dark:bg-amber-950"
                        : "bg-white dark:bg-zinc-900"
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
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[9px] text-slate-400 truncate">{p.current_phase_name ?? "–"}</span>
                      </div>
                    </div>

                    {/* Right: Gantt timeline (fixed pixel width per week) */}
                    <div className="relative overflow-hidden" style={{ width: `${totalWidth}px`, height: "88px" }}>
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

                      {/* Project range bar — visual track only, click navigates to detail */}
                      {projectRangeBar && (
                        <div
                          className={`absolute rounded-xl border border-slate-300/60 bg-slate-200/50 dark:border-white/8 dark:bg-white/8 transition-colors ${toolMode === "select" ? "cursor-pointer hover:bg-slate-300/60 dark:hover:bg-white/12" : "cursor-default"}`}
                          style={{
                            left:   `${(projectRangeBar.offsetPct / 100) * totalWidth}px`,
                            width:  `${Math.max(4, (projectRangeBar.widthPct / 100) * totalWidth)}px`,
                            top:    "24px",
                            height: "28px",
                            zIndex: 2,
                          }}
                          onClick={() => { if (toolMode === "select") router.push(`/dashboard/projects/${p.id}`); }}
                          onMouseMove={e => {
                            if (dragRef.current) return;
                            const rs = toDate(p.start_date);
                            const re = toDate(p.end_date);
                            if (!rs || !re) return;
                            setTooltip({
                              seg:     { key: "range", label: "Project Range", color: "#94a3b8", start: rs, end: re },
                              project: p,
                              phases:  phaseDates,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onMouseLeave={() => { if (!dragRef.current) setTooltip(null); }}
                        />
                      )}

                      {/* Phase bars — individually draggable */}
                      {segments.map(seg => {
                        const active = isPhaseActive(seg.key, p.current_phase_code);
                        const left  = (seg.offsetPct / 100) * totalWidth;
                        const width = Math.max(8, (seg.widthPct / 100) * totalWidth);
                        const isDragging = dragging && dragRef.current?.projectId === p.id && dragRef.current?.phaseKey === seg.key;
                        return (
                          <div
                            key={seg.key}
                            data-drag-bar="true"
                            className="absolute rounded-xl select-none"
                            style={{
                              left:   `${left}px`,
                              width:  `${width}px`,
                              top:    "24px",
                              height: "28px",
                              backgroundColor: seg.color,
                              opacity:   isDragging ? 0.75 : active ? 1 : 0.62,
                              zIndex:    6,
                              cursor:    toolMode === "select" ? "pointer" : toolMode === "delete" ? "not-allowed" : "grab",
                              boxShadow: active
                                ? `0 0 0 2px ${seg.color}55, 0 2px 8px ${seg.color}40`
                                : "0 1px 4px rgba(0,0,0,0.18)",
                            }}
                            onMouseDown={e => { if (toolMode === "drag") startDrag(e, p, seg, "move"); }}
                            onClick={() => {
                              if (toolMode === "select") {
                                router.push(`/dashboard/projects/${p.id}`);
                              } else if (toolMode === "delete") {
                                setDeleteConfirm({ projectId: p.id, seg });
                              }
                            }}
                            onMouseMove={e => {
                              if (dragRef.current) return;
                              setTooltip({ seg, project: p, phases: phaseDates, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => { if (!dragRef.current) setTooltip(null); }}
                          >
                            {/* Phase label */}
                            {width > 44 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 truncate px-2 pointer-events-none">
                                {seg.label.split(" ")[0]}
                              </span>
                            )}
                            {/* Left resize handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2.5 rounded-l-xl z-10 hover:bg-black/10"
                              style={{ cursor: toolMode === "drag" ? "ew-resize" : "inherit" }}
                              onMouseDown={e => { if (toolMode === "drag") { e.stopPropagation(); startDrag(e, p, seg, "resize-left"); } }}
                            />
                            {/* Right resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2.5 rounded-r-xl z-10 hover:bg-black/10"
                              style={{ cursor: toolMode === "drag" ? "ew-resize" : "inherit" }}
                              onMouseDown={e => { if (toolMode === "drag") { e.stopPropagation(); startDrag(e, p, seg, "resize-right"); } }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              );
            })}

          </div>
        </div>{/* end scrollable body */}
      </div>{/* end gantt card */}

      {/* ── Drag date tooltip — updated via direct DOM, no setState during drag ── */}
      <div
        ref={dragTipRef}
        className="fixed z-9999 pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white shadow-lg"
        style={{ display: "none", backgroundColor: "rgba(15,23,42,0.88)", backdropFilter: "blur(6px)", whiteSpace: "nowrap" }}
      />

      {/* ── Bar tooltip — one source of truth for project/phase date ranges ── */}
      {tooltip && (() => {
        const { seg, project: pr, phases, x, y } = tooltip;
        const TIP_W  = 320;
        const TIP_H  = 245; // approximate tooltip height
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
              <div className="text-[10px] text-slate-400 dark:text-white/55 mb-2">
                <p>Range: <span className="font-semibold text-slate-600 dark:text-white/75">{format(seg.start, "dd MMM yy")} → {format(seg.end, "dd MMM yy")}</span></p>
              </div>
              <div className="space-y-1.5 border-t border-slate-200/70 dark:border-white/8 pt-2">
                {phases.map(ph => {
                  const active = isPhaseActive(ph.key, pr.current_phase_code);
                  return (
                    <div key={ph.key} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ph.color, opacity: ph.start || ph.end ? 1 : 0.35 }} />
                      <span className="w-26 truncate font-semibold text-slate-600 dark:text-white/70">
                        {ph.label}{active ? " • current" : ""}
                      </span>
                      <span className="flex-1 text-right font-mono text-slate-500 dark:text-white/55">
                        {fmtRange(ph.start, ph.end)}
                        {ph.pic && (
                          <span className="block font-sans text-[9px] text-slate-400 dark:text-white/40 truncate">
                            PIC: {ph.pic}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Range tooltip ── */}
      {rangeTooltip && rangeStart && rangeEnd && (() => {
        const TIP_W = 240;
        const TIP_H = 90;
        const vw = typeof window !== "undefined" ? window.innerWidth  : 1000;
        const vh = typeof window !== "undefined" ? window.innerHeight : 700;
        const m  = 12;
        const rawLeft = rangeTooltip.x + TIP_W + m > vw ? rangeTooltip.x - TIP_W - m : rangeTooltip.x + m;
        const rawTop  = rangeTooltip.y + TIP_H + m > vh ? rangeTooltip.y - TIP_H - m : rangeTooltip.y + m;
        const left = Math.max(m, Math.min(rawLeft, vw - TIP_W - m));
        const top  = Math.max(m, Math.min(rawTop,  vh - TIP_H - m));
        return (
          <div className="fixed z-999 pointer-events-none" style={{ left, top, width: TIP_W }}>
            <div
              className="rounded-xl border px-3 py-2.5 shadow-xl bg-white dark:bg-zinc-900"
              style={{ borderColor: "rgba(196,149,106,0.4)", boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(196,149,106,0.2)" }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: "var(--brand-sand)" }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand-sand)" }}>Selected Range</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-white/80 font-mono">
                {format(rangeStart, "dd MMM yyyy")} → {format(rangeEnd, "dd MMM yyyy")}
              </p>
              <p className="mt-1 text-[10px] text-slate-400 dark:text-white/45">
                {rangeSummary?.totalActiveProjects ?? 0} project ongoing dalam range ini
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Delete confirmation modal (portalled to body to escape overflow:clip) ── */}
      {deleteConfirm && typeof document !== "undefined" && createPortal((() => {
        const { projectId, seg } = deleteConfirm;
        const phaseName = PHASES.find(ph => ph.key === seg.key)?.label ?? seg.key;
        const phaseColor = PHASES.find(ph => ph.key === seg.key)?.color;

        function cancel() {
          setModalExiting(true);
          setTimeout(() => { setDeleteConfirm(null); setModalExiting(false); }, 200);
        }

        function confirmDelete() {
          const fields     = PHASE_DRAG_FIELDS[seg.key];
          const delSummary = `Cleared ${phaseName} phase dates`;
          setProjects(prev => prev.map(p => p.id !== projectId ? p : {
            ...p, [fields.start]: null, [fields.end]: null,
          }));
          Promise.all([
            fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: fields.start, value: null, change_summary: delSummary, action_type: "field_updated" }) }),
            fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: fields.end,   value: null, change_summary: delSummary, action_type: "field_updated" }) }),
          ]);
          setDeleteConfirm(null);
        }

        return (
          <div className="fixed inset-0 z-9999 flex items-center justify-center">
            <div className={`absolute inset-0 bg-black/50 backdrop-blur-md ${modalExiting ? "animate-backdrop-exit" : "animate-backdrop-enter"}`} onClick={cancel} />
            <div className={`relative z-10 w-80 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 shadow-2xl p-5 space-y-4 ${modalExiting ? "animate-modal-exit" : "animate-modal-enter"}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <Trash2 size={16} className="text-rose-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Clear phase dates?</p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                    This will remove all dates for the{" "}
                    <span className="font-semibold" style={{ color: phaseColor }}>{phaseName}</span>{" "}
                    phase. The action will be recorded in the audit log.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancel}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-colors"
                >
                  Yes, clear it
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ── Drag confirmation modal ── */}
      {dragConfirm && typeof document !== "undefined" && createPortal((() => {
        const { projectId, phaseKey, origStart, origEnd, newStart, newEnd } = dragConfirm;
        const phaseName  = PHASES.find(ph => ph.key === phaseKey)?.label ?? phaseKey;
        const phaseColor = PHASES.find(ph => ph.key === phaseKey)?.color;
        const proj = projects.find(p => p.id === projectId);

        async function confirmDrag() {
          const startStr = format(newStart, "yyyy-MM-dd");
          const endStr   = format(newEnd,   "yyyy-MM-dd");
          const fields   = PHASE_DRAG_FIELDS[phaseKey];
          const summary  = `Rescheduled ${phaseName}: ${format(origStart, "dd MMM")} – ${format(origEnd, "dd MMM")} → ${format(newStart, "dd MMM")} – ${format(newEnd, "dd MMM yyyy")}`;

          setProjects(prev => prev.map(p => p.id !== projectId ? p : {
            ...p, [fields.start]: startStr, [fields.end]: endStr,
          }));
          setDragConfirm(null);

          await Promise.all([
            fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: fields.start, value: startStr, change_summary: summary, action_type: "field_updated" }) }),
            fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: fields.end,   value: endStr,   change_summary: summary, action_type: "field_updated" }) }),
          ]);
        }

        function cancelDrag() {
          // restore original bar position in state
          const fields = PHASE_DRAG_FIELDS[phaseKey];
          setProjects(prev => prev.map(p => p.id !== projectId ? p : {
            ...p,
            [fields.start]: format(origStart, "yyyy-MM-dd"),
            [fields.end]:   format(origEnd,   "yyyy-MM-dd"),
          }));
          setDragConfirm(null);
        }

        return (
          <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter" style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}>
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 shadow-2xl p-5 space-y-4 animate-modal-enter">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${phaseColor}20` }}>
                  <Move size={16} style={{ color: phaseColor }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Confirm reschedule?</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="font-semibold" style={{ color: phaseColor }}>{phaseName}</span>
                    {proj && <span className="text-slate-400"> — {proj.project_name}</span>}
                  </p>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex items-center gap-2 text-slate-400 line-through">
                      <span>{format(origStart, "dd MMM yyyy")}</span>
                      <span>→</span>
                      <span>{format(origEnd, "dd MMM yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                      <span>{format(newStart, "dd MMM yyyy")}</span>
                      <span>→</span>
                      <span>{format(newEnd, "dd MMM yyyy")}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={cancelDrag} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmDrag} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-colors" style={{ backgroundColor: phaseColor }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setLoading(true); loadProjects(); }}
        />
      )}

    </div>
  );
}
