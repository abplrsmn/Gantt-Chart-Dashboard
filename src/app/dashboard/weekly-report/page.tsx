"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { format, eachWeekOfInterval, addDays, parseISO, isValid, getISOWeek, getISOWeekYear, startOfISOWeek } from "date-fns";
import { BarChart2, Camera, Search, ChevronDown, X, CalendarRange, Plus, Loader2, CheckSquare, Square, Trash2, ClipboardList } from "lucide-react";

type SubTask = {
  id: string;
  title: string;
  progress_pct: number;
  phase_id: string | null;
  raw_assignee_name: string | null;
  raw_assigned_by_name: string | null;
};

const PHASE_ROW_ID_MAP: Record<string, string> = {
  operational_brief:  "brief_phase_row_id",
  design:             "design_phase_row_id",
  project_control:    "control_phase_row_id",
  project_management: "pm_phase_row_id",
  handover:           "handover_phase_row_id",
};

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
  current_phase_code: string | null;
  overall_progress_pct: string | null;
  pm_start: string | null;
  pm_end: string | null;
  start_date: string | null;
  end_date: string | null;
  brief_pic: string | null;
  design_pic: string | null;
  control_pic: string | null;
  pm_pic: string | null;
  handover_pic: string | null;
  // Phase date + progress fields
  brief_received: string | null;
  brief_deadline: string | null;
  brief_progress: string | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: string | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: string | null;
  pm_progress: string | null;
  pm_remarks: string | null;
  current_site_progress: string | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: string | null;
  // Phase notes (from phase fields)
  brief_notes: string | null;
  design_notes: string | null;
  control_notes: string | null;
  handover_notes: string | null;
  // Phase advance notes (from "proceed to next phase" confirmation)
  brief_advance_note: string | null;
  design_advance_note: string | null;
  control_advance_note: string | null;
  pm_advance_note: string | null;
};

const PHASE_STEPS = [
  { code: "operational_brief",  short: "Brief",    color: "#64748b" },
  { code: "design",             short: "Design",   color: "#3b82f6" },
  { code: "project_control",    short: "Control",  color: "#f59e0b" },
  { code: "project_management", short: "PM",       color: "#14b8a6" },
  { code: "handover",           short: "Handover", color: "#22c55e" },
] as const;

function fmtShort(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, "d MMM") : "";
}

function getCurrentPic(p: ProjectMeta): string | null {
  const map: Record<string, string | null> = {
    operational_brief:  p.brief_pic,
    design:             p.design_pic,
    project_control:    p.control_pic,
    project_management: p.pm_pic,
    handover:           p.handover_pic,
  };
  return (p.current_phase_code && map[p.current_phase_code]) || null;
}

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

function nowWIB(): Date {
  // WIB = UTC+7; create a Date whose local fields reflect Jakarta time
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  return new Date(utc + 7 * 3_600_000);
}

function toWeekInputValue(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekInputToMonday(val: string): Date | null {
  const m = val.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4dow - 1) + (week - 1) * 7);
  return monday;
}

function weekKeyFromDate(monday: Date): string {
  return `week-${format(monday, "yyyy-MM-dd")}`;
}

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

// ─── PhaseStepperStrip ────────────────────────────────────────────────────────
function PhaseStepperStrip({ project }: { project: ProjectMeta }) {
  const currentIdx = PHASE_STEPS.findIndex(s => s.code === project.current_phase_code);

  const phaseInfos = [
    { start: project.brief_received,  end: project.brief_deadline,   progress: Number(project.brief_progress   ?? 0) },
    { start: project.design_start,    end: project.design_end,        progress: Number(project.design_progress  ?? 0) },
    { start: project.control_start,   end: project.control_end,       progress: Number(project.control_progress ?? 0) },
    { start: project.pm_start,        end: project.pm_end,            progress: Number(project.pm_progress      ?? 0) },
    { start: project.handover_start,  end: project.handover_end,      progress: Number(project.handover_progress ?? 0) },
  ];

  return (
    <div className="flex items-start px-5 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.015]">
      {PHASE_STEPS.flatMap((step, i) => {
        const isPast    = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isReached = isPast || isCurrent;
        const info = phaseInfos[i];

        const items: ReactNode[] = [
          <div key={step.code} className="flex flex-col items-center gap-0.5">
            <div
              className="w-3 h-3 rounded-full border-2 shrink-0 transition-all"
              style={{
                backgroundColor: isReached ? step.color : "transparent",
                borderColor: isReached ? step.color : "#cbd5e1",
                boxShadow: isCurrent ? `0 0 10px ${step.color}90` : "none",
              }}
            />
            <span
              className="text-[9px] font-bold uppercase tracking-wide whitespace-nowrap mt-0.5"
              style={{ color: isReached ? step.color : "#94a3b8" }}
            >
              {step.short}
            </span>
            {isCurrent && (
              <span className="text-[7px] font-bold px-1 py-px rounded-full text-white leading-tight" style={{ backgroundColor: step.color }}>
                NOW
              </span>
            )}
            {(info.start || info.end) && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center leading-tight whitespace-nowrap">
                {fmtShort(info.start)}{info.end && info.end !== info.start ? `–${fmtShort(info.end)}` : ""}
              </span>
            )}
          </div>,
        ];

        if (i < PHASE_STEPS.length - 1) {
          const nextIsReached = (i + 1) <= currentIdx;
          items.push(
            <div
              key={`line-${i}`}
              className="flex-1 h-px mt-1.5 mx-1 shrink min-w-[8px]"
              style={{ backgroundColor: nextIsReached ? PHASE_STEPS[i + 1].color : "#e2e8f0" }}
            />
          );
        }

        return items;
      })}
    </div>
  );
}

// ─── PhaseNotesStrip ─────────────────────────────────────────────────────────
function PhaseNotesStrip({ project }: { project: ProjectMeta }) {
  const notes = [
    { label: "Brief",    color: "#64748b", text: project.brief_advance_note   ?? project.brief_notes },
    { label: "Design",   color: "#3b82f6", text: project.design_advance_note  ?? project.design_notes },
    { label: "Control",  color: "#f59e0b", text: project.control_advance_note ?? project.control_notes },
    { label: "PM",       color: "#14b8a6", text: project.pm_advance_note      ?? project.pm_remarks ?? project.current_site_progress },
    { label: "Handover", color: "#22c55e", text: project.handover_notes },
  ].filter(n => n.text?.trim());

  if (notes.length === 0) return null;

  return (
    <div className="px-5 py-3 border-b border-slate-100 dark:border-white/5 bg-white/50 dark:bg-zinc-900/30">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-2">Phase Notes</p>
      <div className="space-y-2">
        {notes.map(n => (
          <div key={n.label} className="flex items-start gap-2">
            <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white mt-px leading-tight" style={{ backgroundColor: n.color }}>
              {n.label}
            </span>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">{n.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WeekCard ─────────────────────────────────────────────────────────────────
function WeekCard({ week, weekKey, range, projectId }: WeekEntry & { projectId: string }) {
  const [photos, setPhotos]           = useState<Photo[]>([]);
  const [progress, setProgress]       = useState<WeekProgress | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [lightbox, setLightbox]       = useState<Photo | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/attachments?week_key=${weekKey}`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/week-progress`).then(r => r.json()),
    ]).then(([attachRes, progressRes]) => {
      if (attachRes.success) {
        setPhotos((attachRes.data as Photo[]).filter(
          p => (p.mime_type ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(p.file_name)
        ));
      }
      const row = progressRes.success
        ? progressRes.data.find((d: { week_key: string }) => d.week_key === weekKey)
        : null;
      setProgress(row
        ? { plan_pct: Number(row.plan_pct), actual_pct: Number(row.actual_pct), status: row.status ?? "Not started" }
        : { plan_pct: 0, actual_pct: 0, status: "Not started" });
    }).catch(() => {}).finally(() => setLoadingData(false));
  }, [projectId, weekKey]);

  const prog = progress ?? { plan_pct: 0, actual_pct: 0, status: "Not started" };
  const variance = Number((prog.actual_pct - prog.plan_pct).toFixed(2));

  return (
    <div className="rounded-xl border border-slate-200/60 dark:border-white/8 overflow-hidden">
      {/* Week header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(251,191,36,0.12)" }}>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400">Week {week}</span>
        <span className="text-[10px] text-amber-600/80 dark:text-amber-500/80">{range}</span>
        {progress && (
          <span className={`ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${statusColor(prog.status)}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(prog.status)}`} />
            {prog.status}
          </span>
        )}
      </div>

      {/* Photos area — read-only, managed from project detail */}
      <div className="bg-slate-50/50 dark:bg-white/2">
        {photos.length > 0 ? (
          <div className="flex gap-1.5 p-2.5 flex-wrap">
            {photos.map((photo, pi) => (
              <div key={photo.id} className="relative">
                <img
                  src={photo.file_url}
                  alt={photo.file_name}
                  onClick={() => setLightbox(photo)}
                  className="w-20 h-16 object-cover rounded-lg border border-slate-200/60 dark:border-white/8 cursor-zoom-in"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {pi === 3 && photos.length > 4 && (
                  <div
                    onClick={() => setLightbox(photo)}
                    className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center cursor-zoom-in"
                  >
                    <span className="text-white text-xs font-bold">+{photos.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 flex items-center gap-2 text-slate-300 dark:text-slate-700 text-[11px]">
            <Camera size={11} />
            <span>No photos</span>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setLightbox(null); }}
        >
          {/* X button — top-right of viewport */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="relative max-w-4xl w-full animate-modal-enter overflow-hidden rounded-xl" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.file_url}
              alt={lightbox.file_name}
              className="w-full max-h-[90vh] object-contain rounded-xl block"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Progress stats */}
      {loadingData ? (
        <div className="px-3 py-2 flex items-center gap-1.5 text-slate-300 dark:text-slate-700 text-[10px]">
          <div className="w-3 h-3 border border-slate-300 dark:border-slate-700 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
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
      )}
    </div>
  );
}

// ─── ProjectWeeklySection ─────────────────────────────────────────────────────
function ProjectWeeklySection({ project, selectedWeekKey }: { project: ProjectMeta; selectedWeekKey: string }) {
  const router    = useRouter();
  const startDate = project.pm_start ?? project.start_date;
  const endDate   = project.pm_end   ?? project.end_date;
  const weeks     = buildWeeks(startDate, endDate);
  const [expanded, setExpanded] = useState(false);

  // Sub-tasks state
  const [tasks,            setTasks]            = useState<SubTask[]>([]);
  const [phaseRowId,       setPhaseRowId]       = useState<string | null>(null);
  const [loadingTasks,     setLoadingTasks]     = useState(false);
  const [newTaskInput,     setNewTaskInput]     = useState("");
  const [newTaskAssignee,  setNewTaskAssignee]  = useState("");
  const [newTaskAssignedBy,setNewTaskAssignedBy]= useState("");
  const [addingTask,       setAddingTask]       = useState(false);

  const weekEntry = weeks.find(w => w.weekKey === selectedWeekKey);

  // Fetch tasks + current phase row ID when expanded
  useEffect(() => {
    if (!expanded) return;
    setLoadingTasks(true);
    Promise.all([
      fetch(`/api/projects/${project.id}/tasks`).then(r => r.json()),
      fetch(`/api/projects/${project.id}`).then(r => r.json()),
    ]).then(([tasksRes, detailRes]) => {
      if (tasksRes.success) setTasks(tasksRes.data);
      if (detailRes.success && project.current_phase_code) {
        const key = PHASE_ROW_ID_MAP[project.current_phase_code];
        setPhaseRowId(key ? (detailRes.data.project[key] ?? null) : null);
      }
    }).catch(() => {}).finally(() => setLoadingTasks(false));
  }, [expanded, project.id, project.current_phase_code]);

  async function handleTaskAdd() {
    if (!newTaskInput.trim()) return;
    setAddingTask(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskInput.trim(),
          phase_id: phaseRowId ?? null,
          raw_assignee_name: newTaskAssignee.trim() || null,
          raw_assigned_by_name: newTaskAssignedBy.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setTasks(prev => [...prev, json.data]);
        setNewTaskInput(""); setNewTaskAssignee(""); setNewTaskAssignedBy("");
      }
    } finally { setAddingTask(false); }
  }

  async function handleTaskToggle(taskId: string, done: boolean) {
    await fetch(`/api/projects/${project.id}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, progress_pct: done ? 100 : 0 }),
    });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress_pct: done ? 100 : 0 } : t));
  }

  async function handleTaskDelete(taskId: string) {
    await fetch(`/api/projects/${project.id}/tasks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-white/8 overflow-hidden bg-white/60 dark:bg-zinc-900/50">
      {/* Project header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8 text-left hover:bg-slate-50/60 dark:hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              onClick={e => { e.stopPropagation(); router.push(`/dashboard/projects/${project.id}`); }}
              className="text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors truncate cursor-pointer"
            >
              {project.project_name}
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">{project.project_code}</span>
            {project.priority_name && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: project.priority_color ?? undefined, backgroundColor: `${project.priority_color}18` }}>
                {project.priority_name}
              </span>
            )}
            {project.status_label && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: project.status_color ?? undefined, backgroundColor: `${project.status_color}18` }}>
                {project.status_label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {project.unit_name && <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{project.unit_name}</span>}
            {getCurrentPic(project) && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PIC: <span className="font-medium text-slate-700 dark:text-slate-200">{getCurrentPic(project)}</span>
              </span>
            )}
            {(project.start_date || project.end_date) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400">
                <CalendarRange size={10} className="shrink-0" />
                {fmtShort(project.start_date)}{project.end_date ? ` – ${fmtShort(project.end_date)}` : ""}
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={15} className="text-slate-400 shrink-0 transition-transform duration-300" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>

      <div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(0.4,0,0.2,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <PhaseStepperStrip project={project} />
          <PhaseNotesStrip project={project} />

          {weeks.length === 0 ? (
            <div className="p-6 flex items-center gap-2 text-slate-400 dark:text-slate-600 text-xs">
              <Camera size={14} />
              No project dates set — weekly progress unavailable.
            </div>
          ) : weekEntry ? (
            <div className="p-4">
              <WeekCard {...weekEntry} projectId={project.id} />
            </div>
          ) : (
            <div className="p-6 text-xs text-slate-400 dark:text-slate-600">
              Week not in this project's timeline.
            </div>
          )}

          {/* ── Sub-Tasks ── */}
          <div className="px-5 py-4 border-t border-slate-100 dark:border-white/6">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={12} className="text-slate-400 shrink-0" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Sub-Tasks</p>
              {tasks.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400">
                  {tasks.filter(t => Number(t.progress_pct) >= 100).length}/{tasks.length}
                </span>
              )}
            </div>

            {loadingTasks ? (
              <div className="flex items-center gap-2 py-2 text-slate-400 text-xs">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            ) : (
              <>
                {tasks.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {tasks.map(t => {
                      const done = Number(t.progress_pct) >= 100;
                      return (
                        <div key={t.id} className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/4 transition-colors">
                          <button onClick={() => handleTaskToggle(t.id, !done)} className="shrink-0 text-slate-400 hover:text-amber-500 transition-colors">
                            {done ? <CheckSquare size={15} className="text-amber-500" /> : <Square size={15} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs leading-snug ${done ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-200"}`}>{t.title}</p>
                            {(t.raw_assignee_name || t.raw_assigned_by_name) && (
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                {t.raw_assignee_name && <span>{t.raw_assignee_name}</span>}
                                {t.raw_assigned_by_name && <span className="text-slate-300 dark:text-slate-600">by {t.raw_assigned_by_name}</span>}
                              </div>
                            )}
                          </div>
                          <button onClick={() => handleTaskDelete(t.id)} className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-slate-400 hover:text-rose-500 transition-all shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {tasks.length === 0 && <p className="text-[10px] italic text-slate-400 dark:text-slate-500 mb-3">No sub-tasks yet</p>}

                {/* Add form */}
                <div className="space-y-2 pt-2 border-t border-dashed border-slate-200/50 dark:border-white/6">
                  <input
                    value={newTaskInput}
                    onChange={e => setNewTaskInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleTaskAdd(); }}
                    placeholder="Nama sub-task..."
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={newTaskAssignee}
                      onChange={e => setNewTaskAssignee(e.target.value)}
                      placeholder="Assignee..."
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
                    />
                    <input
                      value={newTaskAssignedBy}
                      onChange={e => setNewTaskAssignedBy(e.target.value)}
                      placeholder="Assigned by..."
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleTaskAdd}
                    disabled={addingTask || !newTaskInput.trim()}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white transition-colors"
                  >
                    {addingTask ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Tambah Sub-Task
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [selectedWeekVal, setSelectedWeekVal] = useState(() => toWeekInputValue(nowWIB()));
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-advance selected week when the WIB week rolls over (checked every minute)
  useEffect(() => {
    const id = setInterval(() => {
      const wibWeek = toWeekInputValue(nowWIB());
      setSelectedWeekVal(prev => {
        // Only auto-advance if the user is currently viewing the live current week
        const prevWasCurrentWeek = prev === toWeekInputValue(nowWIB());
        return prevWasCurrentWeek ? wibWeek : prev;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedMonday   = weekInputToMonday(selectedWeekVal) ?? startOfISOWeek(nowWIB());
  const selectedWeekKey  = weekKeyFromDate(selectedMonday);
  const selectedWeekLabel = `${format(selectedMonday, "d MMM")} – ${format(addDays(selectedMonday, 6), "d MMM yyyy")}`;

  const allPics = (p: ProjectMeta) =>
    [p.brief_pic, p.design_pic, p.control_pic, p.pm_pic, p.handover_pic].filter(Boolean).join(" ");

  const filtered = projects.filter(p =>
    !search.trim() ||
    [p.project_name, p.project_code, p.unit_name, p.unit_code, p.status_label, p.current_phase_name, allPics(p)]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const filteredWithWeek = filtered.filter(p => {
    const startDate = p.pm_start ?? p.start_date;
    const endDate   = p.pm_end   ?? p.end_date;
    return buildWeeks(startDate, endDate).some(w => w.weekKey === selectedWeekKey);
  });

  return (
    <div className="space-y-4 pb-10 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 mt-2 justify-between flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-amber-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Report</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week picker */}
          <div className="relative">
            <CalendarRange size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="week"
              value={selectedWeekVal}
              onChange={e => setSelectedWeekVal(e.target.value)}
              className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white w-44 cursor-pointer focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
            />
          </div>
          {/* Search */}
          <label className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project, PIC, unit..."
              className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white w-56 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all"
            />
          </label>
        </div>
      </div>

      {/* Title card */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200/50 dark:border-white/8">
          <Camera size={16} className="shrink-0" style={{ color: "var(--brand-sienna)" }} />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedWeekLabel}</p>
          <span className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
            {filteredWithWeek.length} project{filteredWithWeek.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
          </div>
        ) : filteredWithWeek.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400 dark:text-slate-600">
            {search ? "No projects match your search for this week." : "No projects in this week's range."}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredWithWeek.map(p => (
              <ProjectWeeklySection key={p.id} project={p} selectedWeekKey={selectedWeekKey} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
