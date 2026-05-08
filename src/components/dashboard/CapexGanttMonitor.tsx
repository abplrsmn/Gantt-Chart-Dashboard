"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Search, Folder } from "lucide-react";
import AnimatedDropdown from "./AnimatedDropdown";
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
  segments: Array<{ phase: CapexPhase; startDate: Date; endDate: Date; offset: number; width: number }>;
  progressPct?: number;
  deadlineRisk: "none" | "normal" | "near" | "overdue";
};

const PHASE_ORDER: CapexPhase[] = ["brief", "design", "control", "project_management", "handover", "done"];

const parseFlexibleDate = (value?: string) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;

  // Extract the first valid date string inside a messy text block
  const dateMatch = normalized.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\b/);
  const targetToParse = (dateMatch ? dateMatch[0] : normalized).replace(/\bSept\b/gi, 'Sep');

  const formats = ["d MMM yyyy", "d MMMM yyyy", "d-MMM-yyyy", "d-MMMM-yyyy", "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy"];
  for (const fmt of formats) {
    const parsed = parse(targetToParse, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }

  const nativeDate = new Date(targetToParse);
  if (isValid(nativeDate)) return nativeDate;

  return null;
};

const getEffectivePhase = (project: CapexProject): CapexPhase => {
  if (project.phase === "blocked" || project.blocked) {
    return "blocked";
  }

  if (project.phase === "done" || project.status.toLowerCase() === "done" || project.status.toLowerCase() === "completed") {
    return "done";
  }

  const milestones = project.milestones;
  const handover = parseFlexibleDate(milestones?.handoverDate);
  const pm = parseFlexibleDate(milestones?.projectManagementDate);
  const control = parseFlexibleDate(milestones?.controlDate);
  const design = parseFlexibleDate(milestones?.designDate);
  const brief = parseFlexibleDate(milestones?.briefDate);

  if (handover) return "handover";
  if (pm) return "project_management";
  if (control) return "control";
  if (design) return "design";
  if (brief) return "brief";

  // Fallback to ClickUp phase mapping only if NO measurable dates exist
  if (
    project.phase &&
    (PHASE_ORDER.includes(project.phase) || project.phase === "blocked")
  ) {
    return project.phase;
  }

  return "brief";
};

const resolvePhaseWindow = (project: CapexProject, timelineStart: Date) => {
  const fallbackStart = parseFlexibleDate(project.start) ?? timelineStart;
  const fallbackRawEnd = parseFlexibleDate(project.end) ?? addDays(fallbackStart, 35);
  const fallbackEnd = fallbackRawEnd < fallbackStart ? addDays(fallbackStart, 14) : fallbackRawEnd;

  const brief = parseFlexibleDate(project.milestones?.briefDate);
  const design = parseFlexibleDate(project.milestones?.designDate);
  const control = parseFlexibleDate(project.milestones?.controlDate);
  const pm = parseFlexibleDate(project.milestones?.projectManagementDate);
  const handover = parseFlexibleDate(project.milestones?.handoverDate);
  const phase = getEffectivePhase(project);

  let phaseStart = fallbackStart;
  let phaseEnd = fallbackEnd;

  const normalizedStatus = String(project.status || '').toLowerCase();
  const isExecutionLike = ['project_management', 'handover', 'done'].includes(phase) || !!pm;

  if (isExecutionLike) {
    phaseStart = pm ?? fallbackStart;
    phaseEnd = fallbackEnd;
  } else {
    switch (phase) {
      case "brief":
        phaseStart = brief ?? fallbackStart;
        phaseEnd = design ?? addDays(phaseStart, 14);
        break;
      case "design":
        phaseStart = design ?? brief ?? fallbackStart;
        phaseEnd = control ?? addDays(phaseStart, 21);
        break;
      case "control":
        phaseStart = control ?? design ?? fallbackStart;
        phaseEnd = pm ?? addDays(phaseStart, 21);
        break;
      case "blocked":
        phaseStart = pm ?? control ?? design ?? brief ?? fallbackStart;
        phaseEnd = fallbackEnd;
        break;
      default:
        phaseStart = fallbackStart;
        phaseEnd = fallbackEnd;
        break;
    }
  }

  if (normalizedStatus.includes('done') || normalizedStatus.includes('completed')) {
    phaseEnd = handover ?? fallbackEnd;
  }

  if (phaseEnd < phaseStart) {
    phaseEnd = addDays(phaseStart, 7);
  }

  return { startDate: phaseStart, endDate: phaseEnd };
};

const resolveMilestoneSegments = (project: CapexProject, timelineStart: Date) => {
  const fallbackStart = parseFlexibleDate(project.start) ?? timelineStart;
  const fallbackRawEnd = parseFlexibleDate(project.end) ?? addDays(fallbackStart, 35);
  const fallbackEnd = fallbackRawEnd < fallbackStart ? addDays(fallbackStart, 14) : fallbackRawEnd;
  const effectivePhase = getEffectivePhase(project);

  const brief = parseFlexibleDate(project.milestones?.briefDate);
  const design = parseFlexibleDate(project.milestones?.designDate);
  const control = parseFlexibleDate(project.milestones?.controlDate);
  const pm = parseFlexibleDate(project.milestones?.projectManagementDate);

  const points = [
    brief ? { phase: "brief" as CapexPhase, at: brief } : null,
    design ? { phase: "design" as CapexPhase, at: design } : null,
    control ? { phase: "control" as CapexPhase, at: control } : null,
    pm ? { phase: "project_management" as CapexPhase, at: pm } : null,
  ].filter((item): item is { phase: CapexPhase; at: Date } => item !== null);

  const ranges: Array<{ phase: CapexPhase; startDate: Date; endDate: Date }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    ranges.push({
      phase: current.phase,
      startDate: current.at,
      endDate: next?.at ?? fallbackEnd,
    });
  }

  if (ranges.length === 0) {
    ranges.push({ phase: effectivePhase === "done" || effectivePhase === "blocked" ? "project_management" : effectivePhase, startDate: fallbackStart, endDate: fallbackEnd });
  } else {
    const lastEnd = ranges[ranges.length - 1]?.endDate ?? fallbackStart;
    if (lastEnd < fallbackEnd) {
      const remainingPhase = effectivePhase === "blocked" || effectivePhase === "done" ? effectivePhase : effectivePhase;
      ranges.push({
        phase: remainingPhase,
        startDate: lastEnd,
        endDate: fallbackEnd,
      });
    }
  }

  return ranges.map((range) => {
    const safeEnd = range.endDate < range.startDate ? addDays(range.startDate, 7) : range.endDate;
    return { ...range, endDate: safeEnd };
  });
};

const getPhaseLabel = (phase?: CapexPhase) => {
  switch (phase) {
    case "brief": return "Operational Brief";
    case "design": return "Design";
    case "control": return "Project Control";
    case "project_management": return "Project Management";
    case "handover": return "Handover";
    case "done": return "Completed";
    case "blocked": return "Blocked";
    default: return "Operational Brief";
  }
};

const getPhaseTone = (phase?: CapexPhase) => {
  switch (phase) {
    case "brief": return "bg-slate-500 text-white";
    case "design": return "bg-blue-600 text-white";
    case "control": return "bg-amber-500 text-slate-900";
    case "project_management": return "bg-teal-600 text-white";
    case "handover": return "bg-emerald-600 text-white";
    case "done": return "bg-green-800 text-white";
    case "blocked": return "bg-rose-600 text-white";
    default: return "bg-slate-600 text-white";
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

const splitTaskNote = (note?: string) => {
  if (!note) return [] as Array<{ label: string; value: string }>;
  const compact = note.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  const knownKeys = [
    "Received Date", "APS Release Date", "Contract Amount", "Commence Date",
    "End Contract", "Actual Completion", "Deviation Days", "PROGRESS & NOTES",
    "Current Site", "Source Key", "Hotel Code", "Project No", "Project Name",
    "Description", "Unit", "Start", "End", "Phase", "Status", "Progress",
    "PIC", "Status Note", "Project Status Note", "Next Action", "Managed by", "BAST-1"
  ];

  const parts = compact.split(new RegExp(`(?=\\b(?:${knownKeys.join("|")})\\s*:)`, "g"));
  const result = [];
  for (const part of parts) {
    let match = part.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      let [_, label, value] = match;
      const subParts = value.split(new RegExp(`(?=\\b(?:${knownKeys.join("|")})\\s*:)`, "g"));
      if (subParts.length > 1) {
        for (const sub of subParts) {
          const subMatch = sub.match(/^([^:]{2,40}):\s*(.+)$/);
          if (subMatch) {
            result.push({ label: subMatch[1], value: subMatch[2] });
          } else if (sub.trim()) {
            result.push({ label: label, value: sub.trim() });
          }
        }
      } else {
        result.push({ label, value });
      }
    } else if (part.trim()) {
      result.push({ label: "Info", value: part.trim() });
    }
  }
  return result.filter((item) => item.value.length > 0);
};

export default function CapexGanttMonitor() {
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<CapexProject[]>([]);
  const [mappingRows, setMappingRows] = useState<CapexMappingRow[]>([]);
  const [sphPilotRows, setSphPilotRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [simpleMode, setSimpleMode] = useState(true);
  const [activePhaseTab, setActivePhaseTab] = useState<CapexPhase>("project_management");
  const [milestoneUnitFilter, setMilestoneUnitFilter] = useState<string>("ALL");
  const [yearFilter, setYearFilter] = useState<string>("ALL");

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      try {
        setLoading(true);
        setLoadError(null);
        const [projectsRes, mappingRes, sphPilotRes] = await Promise.all([
          fetch("/api/capex/projects", { cache: "no-store" }),
          fetch("/api/capex/mapping", { cache: "no-store" }),
          fetch("/api/capex/sph-pilot", { cache: "no-store" }),
        ]);
        const projectsJson = await projectsRes.json();
        const mappingJson = await mappingRes.json();
        const sphPilotJson = await sphPilotRes.json();
        if (!active) return;
        if (mappingJson?.success && Array.isArray(mappingJson.data)) {
          setMappingRows(mappingJson.data);
        }
        if (sphPilotJson?.success && Array.isArray(sphPilotJson.data)) {
          setSphPilotRows(sphPilotJson.data);
        }
        if (projectsJson?.success && Array.isArray(projectsJson.data) && projectsJson.data.length > 0) {
          setProjects(projectsJson.data);
        } else {
          setProjects([]);
          if (!projectsJson?.success && projectsJson?.error) setLoadError(String(projectsJson.error));
          else if (mappingJson?.success && Array.isArray(mappingJson.data) && mappingJson.data.length === 0) setLoadError("mapping.json empty");
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
    return () => { active = false; };
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const phase = getEffectivePhase(project);
      const hotel = (project.hotelCode || project.unit || "UNKNOWN").toUpperCase();
      return `${hotel} ${project.name} ${project.status} ${project.pic ?? ""} ${getPhaseLabel(phase)}`
        .toLowerCase()
        .includes(search.toLowerCase());
    });
  }, [projects, search]);

  const milestoneProjects = useMemo<CapexProject[]>(() => {
    return sphPilotRows.map((row: any) => {
      const unit = String(row?.unit || 'UNKNOWN').toUpperCase();
      const name = String(row?.projectName || '').trim();
      return {
        id: `milestone:${unit}:${name.toLowerCase()}`,
        unit,
        hotelCode: unit,
        name,
        start: row?.phases?.project_management?.commence_date || row?.phases?.project_control?.tender_start || row?.phases?.design?.start_design_date || row?.phases?.operational_brief?.received_date || undefined,
        end: row?.phases?.project_management?.end_contract || row?.phases?.handover?.bast_1 || undefined,
        status: 'OPEN',
        phase: 'brief',
        isExecution: false,
        deadlineRisk: 'none',
        blocked: false,
        milestones: {},
        source: 'clickup',
      } as CapexProject;
    });
  }, [sphPilotRows]);

  const milestoneUnitOptions = useMemo(() => {
    return ['ALL', ...Array.from(new Set(milestoneProjects.map((p) => String(p.hotelCode || p.unit || 'UNKNOWN').toUpperCase()))).sort()];
  }, [milestoneProjects]);

  const milestoneProjectsFilteredByUnit = useMemo(() => {
    if (milestoneUnitFilter === 'ALL') return milestoneProjects;
    return milestoneProjects.filter((p) => String(p.hotelCode || p.unit || 'UNKNOWN').toUpperCase() === milestoneUnitFilter);
  }, [milestoneProjects, milestoneUnitFilter]);

  const executionGroupedProjects = useMemo(() => {
    const curatedOrder = (mappingRows || [])
      .map((m) => String(m?.clickupTaskName || '').trim())
      .filter(Boolean);
    const curatedMap = new Map(
      curatedOrder.map((name, index) => [name.toLowerCase(), index])
    );

    const execFiltered = filteredProjects.filter((p) => {
      const projectName = String(p.name || '').trim().toLowerCase();
      const projectYears = [
        parseFlexibleDate(p.start)?.getFullYear(),
        parseFlexibleDate(p.end)?.getFullYear(),
        parseFlexibleDate(p.milestones?.briefDate)?.getFullYear(),
        parseFlexibleDate(p.milestones?.designDate)?.getFullYear(),
        parseFlexibleDate(p.milestones?.controlDate)?.getFullYear(),
        parseFlexibleDate(p.milestones?.projectManagementDate)?.getFullYear(),
        parseFlexibleDate(p.milestones?.handoverDate)?.getFullYear(),
      ].filter((year): year is number => typeof year === 'number');

      const matchesYear = yearFilter === 'ALL' || projectYears.includes(Number(yearFilter));
      if (!matchesYear) return false;

      const phase = getEffectivePhase(p);
      const hasPmSignal = !!parseFlexibleDate(p.milestones?.projectManagementDate);
      const hasHandoverSignal = !!parseFlexibleDate(p.milestones?.handoverDate);
      const progressText = String(p.note || '').toLowerCase();
      const isAborted = progressText.includes('aborted');
      if (isAborted) return false;

      if (hasPmSignal || hasHandoverSignal || ['project_management', 'handover', 'done'].includes(phase)) {
        return true;
      }

      if (curatedMap.size > 0) return curatedMap.has(projectName);
      return false;
    });

    const grouped = new Map<string, CapexProject[]>();
    for (const project of execFiltered) {
      const hotel = (project.hotelCode || project.unit || 'UNKNOWN').toUpperCase();
      const list = grouped.get(hotel) || [];
      list.push(project);
      grouped.set(hotel, list);
    }
    return Array.from(grouped.entries())
      .map(([hotel, items]) => ({
        hotel,
        items: items.sort((a, b) => {
          const aIdx = curatedMap.get(String(a.name || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
          const bIdx = curatedMap.get(String(b.name || '').trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
          if (aIdx !== bIdx) return aIdx - bIdx;
          return a.name.localeCompare(b.name);
        })
      }))
      .sort((a, b) => a.hotel.localeCompare(b.hotel));
  }, [filteredProjects, mappingRows, yearFilter]);

  const summary = useMemo(() => {
    const total = filteredProjects.length;
    const completed = filteredProjects.filter((project) => getEffectivePhase(project) === "done").length;
    const blocked = filteredProjects.filter((project) => getEffectivePhase(project) === "blocked" || project.blocked).length;
    const deadlineRisk = filteredProjects.filter((project) => ["near", "overdue"].includes(getDeadlineRisk(project))).length;

    const byPhase = PHASE_ORDER.reduce<Record<string, number>>((acc, phase) => {
      acc[phase] = filteredProjects.filter((project) => getEffectivePhase(project) === phase).length;
      return acc;
    }, {});

    return { total, completed, blocked, deadlineRisk, byPhase };
  }, [filteredProjects]);

  const timeline = useMemo(() => {
    if (yearFilter !== 'ALL') {
      const selectedYear = Number(yearFilter);
      return {
        start: new Date(selectedYear, 0, 1),
        end: new Date(selectedYear, 11, 31),
      };
    }

    const relevantProjects = executionGroupedProjects.flatMap((group) => group.items);
    const dates = relevantProjects.flatMap((project) => {
      const candidates = [
        parseFlexibleDate(project.start),
        parseFlexibleDate(project.end),
        parseFlexibleDate(project.milestones?.briefDate),
        parseFlexibleDate(project.milestones?.designDate),
        parseFlexibleDate(project.milestones?.controlDate),
        parseFlexibleDate(project.milestones?.projectManagementDate),
        parseFlexibleDate(project.milestones?.handoverDate),
      ];
      return candidates.filter((date): date is Date => date !== null);
    });

    if (dates.length === 0) {
      const currentYear = new Date().getFullYear();
      return {
        start: new Date(currentYear, 0, 1),
        end: new Date(currentYear, 11, 31),
      };
    }

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    return {
      start: new Date(minDate.getFullYear(), 0, 1),
      end: new Date(maxDate.getFullYear(), 11, 31),
    };
  }, [executionGroupedProjects, yearFilter]);

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
      const fallbackWindow = resolvePhaseWindow(project, timeline.start);
      const clampedStart = fallbackWindow.startDate < timeline.start ? timeline.start : fallbackWindow.startDate;
      const clampedEnd = fallbackWindow.endDate > timeline.end ? timeline.end : fallbackWindow.endDate;
      const startDate = clampedStart;
      const endDate = clampedEnd < clampedStart ? clampedStart : clampedEnd;
      const offset = Math.max(0, (differenceInCalendarDays(startDate, timeline.start) / totalDays) * 100);
      const width = Math.max(1.1, ((Math.max(1, differenceInCalendarDays(endDate, startDate) + 1)) / totalDays) * 100);
      const progressPct = typeof project.progress === "number" ? Math.max(0, Math.min(100, project.progress)) : undefined;
      const deadlineRisk = getDeadlineRisk(project);
      const tonePhase = getEffectivePhase(project);
      const segments = [{ phase: tonePhase, startDate, endDate, offset, width }];

      map.set(project.id, { project, startDate, endDate, offset, width, segments, progressPct, deadlineRisk });
    }
    return map;
  }, [filteredProjects, timeline]);

  return (
    <div className="space-y-6">
      <section className="glass-card p-5 space-y-4 overflow-hidden relative">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarRange size={14} className="text-cyan-600" />
              <h3 className="text-base font-bold text-slate-800 dark:text-white">CAPEX Project Monitoring</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Grouped by hotel code. Simple progress timeline view. Deadline is warning only.
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

            <AnimatedDropdown
              value={yearFilter}
              onChange={setYearFilter}
              options={[
                { value: "ALL", label: "All Years" },
                { value: "2025", label: "2025" },
                { value: "2026", label: "2026" },
              ]}
              minWidth={120}
            />

            <button
              type="button"
              onClick={() => setSimpleMode((value) => !value)}
              className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              {simpleMode ? "Simple Mode" : "Detail Mode"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {loading && (
            <span className="inline-flex rounded-full px-2.5 py-1 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Syncing ClickUp...
            </span>
          )}
          {loadError && <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 font-semibold text-rose-700 dark:text-rose-300">Fallback flex: {loadError}</span>}
        </div>
      </section>

      <section className="glass-card p-4 overflow-x-auto relative">
        <div className="min-w-[2200px]">
          <div className="grid grid-cols-[320px_1fr] items-center gap-3 pb-2 border-b border-slate-400/60 dark:border-white/15">
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
            <div className="grid grid-cols-[320px_1fr] items-center gap-3 pt-2 pb-3 border-b border-slate-400/40 dark:border-white/10">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Week</div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}>
                {weekBuckets.map((bucket, index) => {
                  const sameMonthBuckets = weekBuckets.filter((candidate) =>
                    candidate.start.getFullYear() === bucket.start.getFullYear() &&
                    candidate.monthIndex === bucket.monthIndex
                  );
                  const weekNumberInMonth = sameMonthBuckets.findIndex((candidate) =>
                    candidate.start.getTime() === bucket.start.getTime() &&
                    candidate.end.getTime() === bucket.end.getTime()
                  ) + 1;

                  return (
                    <div
                      key={`${bucket.start.toISOString()}-${index}`}
                      className="min-w-[38px] text-center text-[10px] font-medium text-slate-500 dark:text-slate-400"
                      title={`${format(bucket.start, "dd MMM")} - ${format(bucket.end, "dd MMM yyyy")}`}
                    >
                      {`W${weekNumberInMonth}`}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {executionGroupedProjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No execution-phase projects match your current filter.</p>
          ) : (
            <div className="pt-2 space-y-3">
              {executionGroupedProjects.map((group) => (
                <div key={group.hotel} className="space-y-1.5">
                  <div className="grid grid-cols-[320px_1fr] items-center gap-3">
                    <div className="rounded-md bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 text-sm font-bold text-cyan-700 dark:text-cyan-300">
                      {group.hotel} ({group.items.length} project)
                    </div>
                    <div className="h-px bg-slate-400/70 dark:bg-white/15"></div>
                  </div>

                  {group.items.map((project) => {
                    const row = ganttRows.get(project.id);
                    if (!row) return null;

                    return (
                      <div
                        key={project.id}
                        className="w-full grid grid-cols-[320px_1fr] items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-100/60 dark:hover:bg-white/5"
                      >
                        <div className="pl-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{project.name}</p>
                        </div>

                        <div className="relative h-10">
                          <div className={`absolute inset-0 grid ${simpleMode ? "opacity-35" : "opacity-100"}`} style={{ gridTemplateColumns: `repeat(${weekBuckets.length}, minmax(0, 1fr))` }}>
                            {weekBuckets.map((bucket, index) => (
                              <div key={`line-${bucket.start.toISOString()}-${index}`} className="h-full border-r border-slate-400/50 dark:border-white/15"></div>
                            ))}
                          </div>
                          <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-slate-500/60 dark:bg-white/25"></div>

                          <div
                            className="absolute top-1/2 h-6 -translate-y-1/2 rounded-full"
                            style={{ left: `${row.offset}%`, width: `${row.width}%`, backgroundColor: '#06b6d4' }}
                            title={`${project.name}\nProgress: ${typeof row.progressPct === "number" ? row.progressPct + "%" : "N/A"}\nStart: ${format(row.startDate, "dd MMM yyyy")} - End: ${format(row.endDate, "dd MMM yyyy")}`}
                          >
                            {typeof row.progressPct === "number" && row.progressPct > 0 && row.progressPct < 100 && (
                              <div
                                className="absolute right-0 top-0 h-full rounded-r-full"
                                style={{ width: `${100 - row.progressPct}%`, backgroundColor: 'rgba(0,0,0,0.18)' }}
                              ></div>
                            )}
                            {typeof row.progressPct === "number" && (
                              <span className="absolute inset-0 flex items-center px-3 truncate text-[10px] font-semibold text-slate-900 leading-6">
                                {`${row.progressPct}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Milestone Phase</h3>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Structured parameters by project phase
            </p>
            <AnimatedDropdown
              value={milestoneUnitFilter}
              onChange={setMilestoneUnitFilter}
              options={milestoneUnitOptions.map((unit) => ({
                value: unit,
                label: unit === "ALL" ? "All Units" : unit,
              }))}
              minWidth={120}
            />
          </div>
        </div>
        
        {/* TAB BUTTONS (Like Folders) */}
        <div className="flex flex-wrap gap-1 px-1">
          {PHASE_ORDER.map(phase => {
            const phaseProjects = milestoneProjectsFilteredByUnit.filter(p => {
              const unit = String(p.hotelCode || p.unit || '').toUpperCase();
              const name = String(p.name || '').trim().toLowerCase();
              const row = sphPilotRows.find((r) =>
                String(r?.unit || '').toUpperCase() === unit &&
                String(r?.projectName || '').trim().toLowerCase() === name
              );
              if (phase === 'brief') return !!row?.phases?.operational_brief;
              if (phase === 'design') return !!row?.phases?.design;
              if (phase === 'control') return !!row?.phases?.project_control;
              if (phase === 'project_management') return !!row?.phases?.project_management;
              if (phase === 'handover') return !!row?.phases?.handover;
              return getEffectivePhase(p) === phase;
            });
            if (phaseProjects.length === 0) return null;
            
            const isActive = activePhaseTab === phase;
            const tone = isActive ? getPhaseTone(phase) : "text-slate-500 bg-slate-200/50 dark:text-slate-400 dark:bg-white/5";
            
            return (
              <button
                key={phase}
                onClick={() => setActivePhaseTab(phase)}
                className={`relative px-5 pt-3 pb-2.5 rounded-t-xl text-[13px] font-bold tracking-wide transition-all border border-b-0
                  ${isActive 
                    ? "bg-slate-100 lg:bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border-slate-300/80 dark:border-white/20 z-10 translate-y-[2px]" 
                    : "bg-slate-50/50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span>{getPhaseLabel(phase)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${tone}`}>
                    {phaseProjects.length}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* TAB CONTENT */}
        <div className="relative z-0 bg-slate-100 lg:bg-white dark:bg-zinc-800 rounded-b-xl rounded-tr-xl border border-slate-300/80 dark:border-white/20 shadow-md p-4 min-h-[400px]">
          <PhaseTable 
            phase={activePhaseTab} 
            title={getPhaseLabel(activePhaseTab)} 
            projects={milestoneProjectsFilteredByUnit.filter(p => {
              const unit = String(p.hotelCode || p.unit || '').toUpperCase();
              const name = String(p.name || '').trim().toLowerCase();
              const row = sphPilotRows.find((r) =>
                String(r?.unit || '').toUpperCase() === unit &&
                String(r?.projectName || '').trim().toLowerCase() === name
              );
              if (activePhaseTab === 'brief') return !!row?.phases?.operational_brief;
              if (activePhaseTab === 'design') return !!row?.phases?.design;
              if (activePhaseTab === 'control') return !!row?.phases?.project_control;
              if (activePhaseTab === 'project_management') return !!row?.phases?.project_management;
              if (activePhaseTab === 'handover') return !!row?.phases?.handover;
              return getEffectivePhase(p) === activePhaseTab;
            })} 
            allProjects={milestoneProjectsFilteredByUnit}
            sphPilotRows={sphPilotRows}
          />
        </div>
      </section>
    </div>
  );
}

function PhaseTable({ phase, title, projects, allProjects, sphPilotRows }: { phase: CapexPhase, title: string, projects: CapexProject[], allProjects: CapexProject[], sphPilotRows: any[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
         <Folder size={32} className="mb-3 text-slate-300 dark:text-zinc-600" />
         <p>No projects currently.</p>
      </div>
    );
  }

  const phaseDescriptions: Record<string, string> = {
    brief: "Operational Brief (PR) phase currently tracks Brief, Received Date, and Budget/CAPEX.",
    design: "Design (HoD) phase tracks Start Design Date, Design Approval (+1 month), Duration delay(-)/+, Brief, and Working Drawing (+3 weeks).",
    control: "Project Control phase tracks Tender Start, APS = SPK Released (+3 weeks), Duration delay(-)/+, and Contract Amount.",
    project_management: "Project Management phase tracks Commence Date, End Contract, Actual Completion, deviation: delay(-)/+, and Current Site Progress.",
    handover: "Handover phase tracks BAST-1 and BAST-2.",
    done: "Completed phase parameters will be refined step by step.",
    blocked: "Blocked phase parameters will be refined step by step.",
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
        {phaseDescriptions[phase] || `Parameters for ${title} phase.`}
      </div>

      <div className="w-full overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-black/20">
        <table className="w-full text-left text-[10.5px] sm:text-[11px] whitespace-nowrap">
          <thead className="bg-slate-200/50 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-b border-slate-300/60 dark:border-white/10">
            <tr>
              <th className="px-4 py-3 font-bold sticky left-0 bg-slate-200/90 dark:bg-[#202024]/90 z-10 backdrop-blur">Unit</th>
              <th className="px-4 py-3 font-bold max-w-[240px] truncate">Description</th>
              {phase === "brief" ? (
                <>
                  <th className="px-4 py-3 font-bold">Brief</th>
                  <th className="px-4 py-3 font-bold">Received Date</th>
                  <th className="px-4 py-3 font-bold">Budget/CAPEX</th>
                </>
              ) : phase === "design" ? (
                <>
                  <th className="px-4 py-3 font-bold">Start Design Date</th>
                  <th className="px-4 py-3 font-bold">Design Approval (+1 month)</th>
                  <th className="px-4 py-3 font-bold">Duration : delay(-) / +</th>
                  <th className="px-4 py-3 font-bold">Brief</th>
                  <th className="px-4 py-3 font-bold">Working Drawing (+3 weeks)</th>
                </>
              ) : phase === "control" ? (
                <>
                  <th className="px-4 py-3 font-bold">Tender Start</th>
                  <th className="px-4 py-3 font-bold">APS = SPK Released (+3 weeks)</th>
                  <th className="px-4 py-3 font-bold">Duration : delay(-) / +</th>
                  <th className="px-4 py-3 font-bold">Contract Amount</th>
                </>
              ) : phase === "project_management" ? (
                <>
                  <th className="px-4 py-3 font-bold">Commence Date</th>
                  <th className="px-4 py-3 font-bold">End Contract</th>
                  <th className="px-4 py-3 font-bold">Actual Completion</th>
                  <th className="px-4 py-3 font-bold">deviation : delay(-) / +</th>
                  <th className="px-4 py-3 font-bold">Current Site Progress</th>
                </>
              ) : phase === "handover" ? (
                <>
                  <th className="px-4 py-3 font-bold">BAST-1</th>
                  <th className="px-4 py-3 font-bold">BAST-2</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 font-bold">Op. Brief / PR</th>
                  <th className="px-4 py-3 font-bold">Received Date</th>
                  <th className="px-4 py-3 font-bold">Budget/CAPEX</th>
                  <th className="px-4 py-3 font-bold">Start Design Date</th>
                  <th className="px-4 py-3 font-bold">Design Approval</th>
                  <th className="px-4 py-3 font-bold">Tender Start</th>
                  <th className="px-4 py-3 font-bold">APS/SPK Released</th>
                  <th className="px-4 py-3 font-bold">Contract Amount</th>
                  <th className="px-4 py-3 font-bold">Commence Date</th>
                  <th className="px-4 py-3 font-bold">End Contract</th>
                  <th className="px-4 py-3 font-bold">Actual Completion</th>
                  <th className="px-4 py-3 font-bold">Deviation</th>
                  <th className="px-4 py-3 font-bold">Current Site Progress</th>
                  <th className="px-4 py-3 font-bold">Remarks</th>
                  <th className="px-4 py-3 font-bold">BAST-1</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
            {projects.map(proj => {
              const notes = splitTaskNote(proj.note);
              const getVal = (keys: string[]) => {
                const lowerKeys = keys.map(k => k.toLowerCase());
                const found = notes.find(n => lowerKeys.includes(n.label.toLowerCase()));
                return found ? found.value : "-";
              };

              const unit = (proj.hotelCode || proj.unit || "UNKNOWN").toUpperCase();
              const desc = proj.name;
              const matchedProject = allProjects.find((candidate) =>
                String(candidate?.hotelCode || candidate?.unit || '').toUpperCase() === unit &&
                String(candidate?.name || '').trim().toLowerCase() === String(proj.name || '').trim().toLowerCase() &&
                candidate.source === 'clickup'
              ) || proj;
              const sphPilot = sphPilotRows.find((row) =>
                String(row?.unit || '').toUpperCase() === unit &&
                String(row?.projectName || '').trim().toLowerCase() === String(proj.name || '').trim().toLowerCase()
              );
              const operationalBrief = getVal(["Operational Brief", "Brief"]);
              const brief = phase === "brief" && sphPilot?.phases?.operational_brief
                ? (sphPilot.phases.operational_brief.brief ?? "-")
                : (operationalBrief !== "-" ? operationalBrief : getVal(["Operational Brief Date", "Brief Date", "PR Date"]));
              const received = phase === "brief" && sphPilot?.phases?.operational_brief
                ? (sphPilot.phases.operational_brief.received_date ?? "-")
                : getVal(["Received Date"]);
              const budget = phase === "brief" && sphPilot?.phases?.operational_brief
                ? (sphPilot.phases.operational_brief.budget_capex ?? "-")
                : getVal(["Budget/CAPEX", "Budget", "Capex Budget", "Budget CAPEX"]);
              const startDesign = phase === "design" && sphPilot?.phases?.design
                ? (sphPilot.phases.design.start_design_date ?? "-")
                : (matchedProject.milestones?.designDate || getVal(["Start Design Date", "Design Start", "Design"]));
              const approval = phase === "design" && sphPilot?.phases?.design
                ? (sphPilot.phases.design.design_approval ?? "-")
                : getVal(["Design Approval", "Approval Date"]);
              const designDuration = phase === "design" && sphPilot?.phases?.design
                ? (sphPilot.phases.design.duration_delay ?? "-")
                : getVal(["Design Duration Delay", "Duration", "Duration Delay"]);
              const workingDrawing = phase === "design" && sphPilot?.phases?.design
                ? (sphPilot.phases.design.working_drawing ?? "-")
                : getVal(["Working Drawing"]);
              const tender = phase === "control" && sphPilot?.phases?.project_control
                ? (sphPilot.phases.project_control.tender_start ?? "-")
                : getVal(["Tender Start", "Tender Date", "Tender"]);
              const aps = phase === "control" && sphPilot?.phases?.project_control
                ? (sphPilot.phases.project_control.spk_released ?? "-")
                : getVal(["APS/SPK Released", "APS Release Date", "SPK Release Date", "APS", "SPK Released"]);
              const controlDuration = phase === "control" && sphPilot?.phases?.project_control
                ? (sphPilot.phases.project_control.duration_delay ?? "-")
                : getVal(["SPK Duration Delay", "Control Duration Delay", "Duration", "Duration Delay"]);
              const contractAmtRaw = phase === "control" && sphPilot?.phases?.project_control
                ? (sphPilot.phases.project_control.contract_amount ?? "-")
                : getVal(["Contract Amount", "Contract Amt", "Amount"]);
              const contractAmt = (() => {
                const raw = String(contractAmtRaw ?? "-").trim();
                if (!raw || raw === "-" || raw.toLowerCase() === "null") return "-";
                const digits = raw.replace(/[^\d,-.]/g, "").replace(/,/g, "");
                const num = Number(digits);
                if (!Number.isFinite(num)) return raw;
                return `Rp ${new Intl.NumberFormat("id-ID").format(num)}`;
              })();
              const commence = phase === "project_management" && sphPilot?.phases?.project_management
                ? (sphPilot.phases.project_management.commence_date ?? "-")
                : (matchedProject.milestones?.projectManagementDate || getVal(["Commence Date", "Commence"]));
              const endContact = phase === "project_management" && sphPilot?.phases?.project_management
                ? (sphPilot.phases.project_management.end_contract ?? "-")
                : (matchedProject.milestones?.handoverDate || getVal(["End Contract", "End Date"]));
              const actualComp = phase === "project_management" && sphPilot?.phases?.project_management
                ? (sphPilot.phases.project_management.actual_completion ?? "-")
                : getVal(["Actual Completion", "Completion Date", "Actual Comp"]);
              const deviation = phase === "project_management" && sphPilot?.phases?.project_management
                ? (sphPilot.phases.project_management.deviation ?? "-")
                : getVal(["Deviation", "Dev Days"]);
              const siteProg = phase === "project_management" && sphPilot?.phases?.project_management
                ? (sphPilot.phases.project_management.current_site_progress ?? "-")
                : getVal(["Current Site Progress", "Site Progress", "Progress"]);
              const remarks = getVal(["Remarks", "Note"]);
              const bast1 = phase === "handover" && sphPilot?.phases?.handover
                ? (sphPilot.phases.handover.bast_1 ?? "-")
                : getVal(["BAST-1", "BAST 1", "BAST-I", "BAST I"]);
              const bast2 = phase === "handover" && sphPilot?.phases?.handover
                ? (sphPilot.phases.handover.bast_2 ?? "-")
                : getVal(["BAST-2", "BAST 2", "BAST-II", "BAST II"]);

              return (
                <tr key={proj.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-50/90 dark:bg-[#1a1a1e]/90 group-hover:bg-slate-100 dark:group-hover:bg-[#202024] z-10 transition-colors backdrop-blur shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    {unit}
                  </td>
                  <td className="px-4 py-3 max-w-[280px] whitespace-normal leading-snug text-slate-800 dark:text-slate-200 font-medium">
                    {desc}
                  </td>
                  {phase === "brief" ? (
                    <>
                      <td className="px-4 py-3">{brief}</td>
                      <td className="px-4 py-3">{received}</td>
                      <td className="px-4 py-3">{budget}</td>
                    </>
                  ) : phase === "design" ? (
                    <>
                      <td className="px-4 py-3">{startDesign}</td>
                      <td className="px-4 py-3">{approval}</td>
                      <td className="px-4 py-3 font-bold">{designDuration}</td>
                      <td className="px-4 py-3">{brief}</td>
                      <td className="px-4 py-3">{workingDrawing}</td>
                    </>
                  ) : phase === "control" ? (
                    <>
                      <td className="px-4 py-3">{tender}</td>
                      <td className="px-4 py-3">{aps}</td>
                      <td className="px-4 py-3 font-bold">{controlDuration}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">{contractAmt}</td>
                    </>
                  ) : phase === "project_management" ? (
                    <>
                      <td className="px-4 py-3">{commence}</td>
                      <td className="px-4 py-3">{endContact}</td>
                      <td className="px-4 py-3">{actualComp}</td>
                      <td className="px-4 py-3 font-bold">{deviation}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={siteProg}>{siteProg}</td>
                    </>
                  ) : phase === "handover" ? (
                    <>
                      <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400 font-medium">{bast1}</td>
                      <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400 font-medium">{bast2}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{brief}</td>
                      <td className="px-4 py-3">{received}</td>
                      <td className="px-4 py-3">{budget}</td>
                      <td className="px-4 py-3">{startDesign}</td>
                      <td className="px-4 py-3">{approval}</td>
                      <td className="px-4 py-3">{tender}</td>
                      <td className="px-4 py-3">{aps}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">{contractAmt}</td>
                      <td className="px-4 py-3">{commence}</td>
                      <td className="px-4 py-3">{endContact}</td>
                      <td className="px-4 py-3">{actualComp}</td>
                      <td className="px-4 py-3 font-bold">{deviation}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={siteProg}>{siteProg}</td>
                      <td className="px-4 py-3 max-w-[300px] whitespace-normal leading-snug" title={remarks}>
                         <span className="line-clamp-2">{remarks}</span>
                      </td>
                      <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400 font-medium">{bast1}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
