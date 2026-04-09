"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Filter, Layers3, Search } from "lucide-react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  min,
  parse,
  startOfDay,
} from "date-fns";

type CapexPhase =
  | "brief"
  | "design"
  | "control"
  | "project_management"
  | "handover"
  | "done"
  | "blocked";

type CapexMilestones = {
  briefDate?: string;
  designDate?: string;
  controlDate?: string;
  projectManagementDate?: string;
  handoverDate?: string;
};

type CapexProject = {
  id: string;
  unit: string;
  hotelCode?: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  url?: string;
  phase?: CapexPhase;
  deadlineRisk?: "none" | "normal" | "near" | "overdue";
  blocked?: boolean;
  milestones?: CapexMilestones;
  source?: "clickup" | "seed";
};

type CapexMappingRow = {
  no: number;
  clickupTaskId: string | null;
  clickupTaskName?: string | null;
};

type WeekBucket = {
  start: Date;
  end: Date;
  monthIndex: number;
};

type GanttRow = {
  project: CapexProject;
  startDate: Date;
  endDate: Date;
  offset: number;
  width: number;
  progressPct?: number;
  deadlineRisk: "none" | "normal" | "near" | "overdue";
};

const PHASE_ORDER: CapexPhase[] = ["brief", "design", "control", "project_management", "handover", "done"];

const parseFlexibleDate = (value?: string) => {
  if (!value) return null;
  const formats = ["d MMM yyyy", "d MMMM yyyy", "d-MMM-yyyy", "d-MMMM-yyyy"];
  for (const fmt of formats) {
    const parsed = parse(value, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
};

const getPhaseLabel = (phase?: CapexPhase) => {
  switch (phase) {
    case "brief":
      return "Operational Brief";
    case "design":
      return "Design";
    case "control":
      return "Project Control";
    case "project_management":
      return "Project Management";
    case "handover":
      return "Handover";
    case "done":
      return "Completed";
    case "blocked":
      return "Blocked";
    default:
      return "Operational Brief";
  }
};

const getPhaseTone = (phase?: CapexPhase) => {
  switch (phase) {
    case "brief":
      return "bg-slate-500 text-white";
    case "design":
      return "bg-blue-600 text-white";
    case "control":
      return "bg-amber-500 text-slate-900";
    case "project_management":
      return "bg-teal-600 text-white";
    case "handover":
      return "bg-emerald-600 text-white";
    case "done":
      return "bg-green-800 text-white";
    case "blocked":
      return "bg-rose-600 text-white";
    default:
      return "bg-slate-600 text-white";
  }
};

const getDeadlineRisk = (project: CapexProject): GanttRow["deadlineRisk"] => {
  if (project.deadlineRisk) return project.deadlineRisk;
  const endDate = parseFlexibleDate(project.end);
  if (!endDate) return "none";
  const daysLeft = differenceInCalendarDays(startOfDay(endDate), startOfDay(new Date()));
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 14) return "near";
  return "normal";
};

const getRiskBadgeTone = (risk: GanttRow["deadlineRisk"]) => {
  if (risk === "overdue") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (risk === "near") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-slate-500/10 text-slate-600 dark:text-slate-300";
};

const getRiskLabel = (risk: GanttRow["deadlineRisk"]) => {
  if (risk === "overdue") return "Overdue";
  if (risk === "near") return "Near Deadline";
  if (risk === "normal") return "On Date";
  return "No Deadline";
};

const getRiskRing = (risk: GanttRow["deadlineRisk"]) => {
  if (risk === "overdue") return "ring-2 ring-rose-500/80";
  if (risk === "near") return "ring-2 ring-amber-500/70";
  return "";
};

const milestoneLadder = [
  { key: "brief", label: "Operational Brief / PR", dateKey: "briefDate" as const },
  { key: "design", label: "Design (HoD)", dateKey: "designDate" as const },
  { key: "control", label: "Project Control", dateKey: "controlDate" as const },
  { key: "project_management", label: "Project Management Team", dateKey: "projectManagementDate" as const },
  { key: "handover", label: "Handover", dateKey: "handoverDate" as const },
];

const splitTaskNote = (note?: string) => {
  if (!note) return [] as Array<{ label: string; value: string }>;
  const compact = note.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  const knownKeys = [
    "Source Key",
    "Hotel Code",
    "Unit",
    "Start",
    "End",
    "Phase",
    "Status",
    "Progress",
    "PIC",
    "Status Note",
    "Project Status Note",
    "Next Action",
    "Managed by",
  ];

  const parts = compact.split(new RegExp(`\\s(?=(?:${knownKeys.join("|")}):)`, "g"));
  return parts
    .map((part, index) => {
      const match = part.match(/^([^:]{2,40}):\s*(.+)$/);
      if (match) return { label: match[1], value: match[2] };
      if (index === 0) return { label: "Description", value: part };
      return { label: "Info", value: part };
    })
    .filter((item) => item.value.length > 0);
};

export default function CapexGanttMonitor() {
  const [search, setSearch] = useState("");
  const [hotelFilter, setHotelFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [projects, setProjects] = useState<CapexProject[]>([]);
  const [mappingRows, setMappingRows] = useState<CapexMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [simpleMode, setSimpleMode] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        setLoading(true);
        setLoadError(null);
        const [projectsRes, mappingRes] = await Promise.all([
          fetch("/api/capex/projects", { cache: "no-store" }),
          fetch("/api/capex/mapping", { cache: "no-store" }),
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
          else if (mappingJson?.success && Array.isArray(mappingJson.data) && mappingJson.data.length === 0) {
            setLoadError("mapping.json empty");
          }
        }
      } catch (error: unknown) {
        if (!active) return;
        setProjects([]);
        setLoadError(error instanceof Error ? error.message : "Failed to load CAPEX projects");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const hotelOptions = useMemo(() => {
    const unique = new Set(projects.map((project) => (project.hotelCode || project.unit || "UNKNOWN").toUpperCase()));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const phase = project.phase || "brief";
      const hotel = (project.hotelCode || project.unit || "UNKNOWN").toUpperCase();
      const matchesSearch = `${hotel} ${project.name} ${project.status} ${project.pic ?? ""} ${getPhaseLabel(phase)}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesHotel = hotelFilter === "All" || hotel === hotelFilter;
      const matchesPhase = phaseFilter === "All" || phase === phaseFilter;
      return matchesSearch && matchesHotel && matchesPhase;
    });
  }, [projects, search, hotelFilter, phaseFilter]);

  const groupedProjects = useMemo(() => {
    const grouped = new Map<string, CapexProject[]>();
    for (const project of filteredProjects) {
      const hotel = (project.hotelCode || project.unit || "UNKNOWN").toUpperCase();
      const list = grouped.get(hotel) || [];
      list.push(project);
      grouped.set(hotel, list);
    }

    return Array.from(grouped.entries())
      .map(([hotel, items]) => ({
        hotel,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.hotel.localeCompare(b.hotel));
  }, [filteredProjects]);

  const selectedProject = useMemo(() => {
    return filteredProjects.find((project) => project.id === selectedProjectId) || filteredProjects[0] || projects[0];
  }, [projects, filteredProjects, selectedProjectId]);

  const summary = useMemo(() => {
    const total = filteredProjects.length;
    const completed = filteredProjects.filter((project) => (project.phase || "brief") === "done").length;
    const blocked = filteredProjects.filter((project) => (project.phase || "brief") === "blocked" || project.blocked).length;
    const deadlineRisk = filteredProjects.filter((project) => ["near", "overdue"].includes(getDeadlineRisk(project))).length;

    const byPhase = PHASE_ORDER.reduce<Record<string, number>>((acc, phase) => {
      acc[phase] = filteredProjects.filter((project) => (project.phase || "brief") === phase).length;
      return acc;
    }, {});

    return { total, completed, blocked, deadlineRisk, byPhase };
  }, [filteredProjects]);

  const timeline = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return {
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, 11, 31),
    };
  }, []);

  const weekBuckets = useMemo<WeekBucket[]>(() => {
    const buckets: WeekBucket[] = [];
    let cursor = timeline.start;

    while (cursor <= timeline.end) {
      const weekEnd = min([addDays(cursor, 6), timeline.end]);
      buckets.push({ start: cursor, end: weekEnd, monthIndex: cursor.getMonth() });
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

  const ganttRows = useMemo(() => {
    const totalDays = Math.max(1, differenceInCalendarDays(timeline.end, timeline.start) + 1);
    const map = new Map<string, GanttRow>();

    for (const project of filteredProjects) {
      const startDate = parseFlexibleDate(project.start) ?? timeline.start;
      const rawEnd = parseFlexibleDate(project.end);
      const endDate = rawEnd ?? addDays(startDate, 35);
      const safeEndDate = endDate < startDate ? addDays(startDate, 14) : endDate;

      const clampedStart = startDate < timeline.start ? timeline.start : startDate;
      const clampedEnd = safeEndDate > timeline.end ? timeline.end : safeEndDate;
      const duration = Math.max(1, differenceInCalendarDays(clampedEnd, clampedStart) + 1);

      const offset = Math.max(0, (differenceInCalendarDays(clampedStart, timeline.start) / totalDays) * 100);
      const width = Math.max(1.1, (duration / totalDays) * 100);
      const progressPct = typeof project.progress === "number" ? Math.max(0, Math.min(100, project.progress)) : undefined;
      const deadlineRisk = getDeadlineRisk(project);

      map.set(project.id, {
        project,
        startDate,
        endDate: safeEndDate,
        offset,
        width,
        progressPct,
        deadlineRisk,
      });
    }

    return map;
  }, [filteredProjects, timeline]);

  const selectedNoteItems = useMemo(() => splitTaskNote(selectedProject?.note), [selectedProject]);
  const unresolvedCount = mappingRows.filter((row) => !row.clickupTaskId).length;

  const activePhaseIndex = useMemo(() => {
    if (!selectedProject) return 0;
    const selectedPhase = selectedProject.phase || "brief";
    if (selectedPhase === "blocked") return 2;
    const idx = PHASE_ORDER.indexOf(selectedPhase);
    return idx >= 0 ? idx : 0;
  }, [selectedProject]);

  return (
    <div className="space-y-4">
      <section className="glass-card p-5 space-y-4 overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 rounded-t-2xl"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarRange size={14} className="text-cyan-600" />
              <h3 className="text-base font-bold text-slate-800 dark:text-white">CAPEX Project Monitoring</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grouped by hotel code. Gantt color shows milestone phase. Deadline is warning only.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <label className="relative flex-1 lg:w-60">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search project or PIC"
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </label>

            <label className="relative min-w-36">
              <Layers3 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={hotelFilter}
                onChange={(event) => setHotelFilter(event.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-9 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <option value="All">All Hotel</option>
                {hotelOptions.map((hotel) => (
                  <option key={hotel} value={hotel}>{hotel}</option>
                ))}
              </select>
            </label>

            <label className="relative min-w-44">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={phaseFilter}
                onChange={(event) => setPhaseFilter(event.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-9 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <option value="All">All Phase</option>
                <option value="brief">Operational Brief</option>
                <option value="design">Design</option>
                <option value="control">Project Control</option>
                <option value="project_management">Project Management</option>
                <option value="handover">Handover</option>
                <option value="done">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setSimpleMode((value) => !value)}
              className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              {simpleMode ? "Simple Mode" : "Detail Mode"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-gradient-to-r from-slate-50 to-cyan-50/60 dark:from-zinc-900/40 dark:to-cyan-950/20 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">How To Read</p>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Quick guide for non-technical users</span>
          </div>

          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="rounded-lg border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Group</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Kiri chart = kode hotel (ALV, ACC, AKB, dll) dan daftar project per hotel.</p>
            </div>

            <div className="rounded-lg border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Phase Color</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Warna bar Gantt = milestone phase aktif (Brief, Design, Control, PM, Handover).</p>
            </div>

            <div className="rounded-lg border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Deadline Warning</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Deadline hanya warning sekunder: badge/ring untuk near deadline atau overdue.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {loading && (
            <span className="inline-flex rounded-full px-2.5 py-1 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Syncing ClickUp...
            </span>
          )}
          <span className="inline-flex rounded-full bg-slate-200/70 dark:bg-zinc-800 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300">Projects {summary.total}</span>
          <span className="inline-flex rounded-full bg-green-500/10 px-2.5 py-1 font-semibold text-green-700 dark:text-green-300">Completed {summary.completed}</span>
          <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300">Blocked {summary.blocked}</span>
          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300">Deadline Risk {summary.deadlineRisk}</span>
          <span className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${unresolvedCount > 0 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
            Mapping unresolved: {unresolvedCount}
          </span>
          {loadError && <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300">Fallback active: {loadError}</span>}
        </div>

        <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 p-2.5">
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Milestone Phase Summary</p>
          <div className="flex flex-wrap gap-2">
            {PHASE_ORDER.map((phase) => (
              <span
                key={phase}
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPhaseTone(phase)}`}
              >
                {getPhaseLabel(phase)} {summary.byPhase[phase] || 0}
              </span>
            ))}
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPhaseTone("blocked")}`}>
              Blocked {summary.byPhase.blocked || 0}
            </span>
          </div>
        </div>
      </section>

      <section className="glass-card p-4 overflow-x-auto">
        <div className="min-w-[1450px]">
          <div className="grid grid-cols-[320px_1fr] items-center gap-3 pb-2 border-b border-slate-200/60 dark:border-white/10">
            <div className="rounded-md bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">Hotel / Project</div>
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

          {!simpleMode && (
            <div className="grid grid-cols-[320px_1fr] items-center gap-3 pt-2 pb-3 border-b border-slate-200/40 dark:border-white/10">
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
          )}

          {groupedProjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No projects match your current filter.</p>
          ) : (
            <div className="pt-2 space-y-3">
              {groupedProjects.map((group) => (
                <div key={group.hotel} className="space-y-1.5">
                  <div className="grid grid-cols-[320px_1fr] items-center gap-3">
                    <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-300">
                      {group.hotel} ({group.items.length} project)
                    </div>
                    <div className="h-px bg-slate-200/70 dark:bg-white/10"></div>
                  </div>

                  {group.items.map((project) => {
                    const row = ganttRows.get(project.id);
                    if (!row) return null;

                    const phase = project.phase || "brief";
                    const riskTone = getRiskBadgeTone(row.deadlineRisk);
                    const isSelected = selectedProject?.id === project.id;

                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        className={`w-full grid grid-cols-[320px_1fr] items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors ${isSelected ? "bg-cyan-500/10" : "hover:bg-slate-100/60 dark:hover:bg-white/5"}`}
                      >
                        <div className="pl-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{project.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">PIC: {project.pic || "Belum diisi"}</span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskTone}`}>
                              {getRiskLabel(row.deadlineRisk)}
                            </span>
                          </div>
                        </div>

                        <div className="relative h-10">
                          <div className={`absolute inset-0 grid ${simpleMode ? "opacity-35" : "opacity-100"}`} style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}>
                            {weekBuckets.map((bucket, index) => (
                              <div key={`line-${bucket.start.toISOString()}-${index}`} className="h-full border-r border-slate-200/60 dark:border-white/10"></div>
                            ))}
                          </div>
                          <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-300/90 dark:bg-white/20"></div>
                          <div className="absolute top-0 bottom-0 w-[2px] bg-rose-500/80" style={{ left: `${todayOffset}%` }} title={`Today: ${format(new Date(), "dd MMM yyyy")}`}></div>

                          <div
                            className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-full px-1 text-[10px] font-semibold flex items-center whitespace-nowrap overflow-hidden ${getPhaseTone(phase)} ${getRiskRing(row.deadlineRisk)}`}
                            style={{ left: `${row.offset}%`, width: `${row.width}%` }}
                            title={`${format(row.startDate, "dd MMM yyyy")} - ${format(row.endDate, "dd MMM yyyy")}`}
                          >
                            {typeof row.progressPct === "number" && (
                              <div className="h-full rounded-full bg-black/20" style={{ width: `${row.progressPct}%` }}></div>
                            )}
                            <span className="absolute left-3 right-2 truncate">
                              {typeof row.progressPct === "number" ? `${row.progressPct}% • ${getPhaseLabel(phase)}` : `${getPhaseLabel(phase)} • No progress`}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedProject && (
        <section className="glass-card p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedProject.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Hotel: {(selectedProject.hotelCode || selectedProject.unit || "UNKNOWN").toUpperCase()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getPhaseTone(selectedProject.phase || "brief")}`}>
                {getPhaseLabel(selectedProject.phase || "brief")}
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getRiskBadgeTone(getDeadlineRisk(selectedProject))}`}>
                {getRiskLabel(getDeadlineRisk(selectedProject))}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
            <MiniInfo label="PIC" value={selectedProject.pic || "-"} />
            <MiniInfo label="Start" value={selectedProject.start || "-"} />
            <MiniInfo label="End" value={selectedProject.end || "TBD"} />
            <MiniInfo label="Progress" value={typeof selectedProject.progress === "number" ? `${selectedProject.progress}%` : "No data"} />
            <MiniInfo label="Next Action" value={selectedProject.nextAction || "-"} />
          </div>

          <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Milestone Ladder Summary</p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2">
              {milestoneLadder.map((step, index) => {
                const doneState = (selectedProject.phase || "brief") === "done" || index < activePhaseIndex;
                const currentState = (selectedProject.phase || "brief") !== "done" && index === activePhaseIndex;
                const stepDate = selectedProject.milestones?.[step.dateKey] || "-";

                return (
                  <div
                    key={step.key}
                    className={`rounded-md border px-2.5 py-2 ${doneState ? "border-emerald-500/30 bg-emerald-500/10" : currentState ? "border-cyan-500/30 bg-cyan-500/10" : "border-slate-200/70 dark:border-white/10 bg-white/50 dark:bg-zinc-900/40"}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{step.label}</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{stepDate}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Task Notes</p>
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
      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 break-words">{value}</p>
    </div>
  );
}
