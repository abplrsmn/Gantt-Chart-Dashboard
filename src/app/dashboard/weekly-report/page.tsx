"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { format, eachWeekOfInterval, addDays, parseISO, isValid } from "date-fns";
import { BarChart2, Camera, Search, ChevronDown, X } from "lucide-react";

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
  // Phase notes
  brief_notes: string | null;
  design_notes: string | null;
  control_notes: string | null;
  handover_notes: string | null;
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
            {info.progress > 0 && (
              <span className="text-[8px] font-semibold" style={{ color: isReached ? step.color : "#94a3b8" }}>
                {Math.round(info.progress)}%
              </span>
            )}
            {(info.start || info.end) && (
              <span className="text-[8px] text-slate-400 dark:text-slate-600 text-center leading-tight whitespace-nowrap">
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
    { label: "Brief",    color: "#64748b", text: project.brief_notes },
    { label: "Design",   color: "#3b82f6", text: project.design_notes },
    { label: "Control",  color: "#f59e0b", text: project.control_notes },
    { label: "PM",       color: "#14b8a6", text: project.pm_remarks ?? project.current_site_progress },
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
function ProjectWeeklySection({ project }: { project: ProjectMeta }) {
  const startDate = project.pm_start ?? project.start_date;
  const endDate   = project.pm_end   ?? project.end_date;
  const weeks     = buildWeeks(startDate, endDate);

  const months = Array.from(new Map(weeks.map(w => [w.monthKey, w.monthKey])).entries());
  const [activeMonth, setActiveMonth] = useState(months[0]?.[0] ?? "");
  const [expanded, setExpanded]       = useState(false);

  const filteredWeeks = weeks.filter(w => w.monthKey === activeMonth);

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-white/8 overflow-hidden bg-white/60 dark:bg-zinc-900/50">
      {/* Project header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8 text-left hover:bg-slate-50/60 dark:hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{project.project_name}</span>
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
            {weeks.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">{weeks.length} weeks</span>}
          </div>
        </div>
        <ChevronDown size={15} className="text-slate-400 shrink-0 transition-transform duration-300" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
      <div style={{ overflow: "hidden" }}>
        {/* Phase stepper */}
        <PhaseStepperStrip project={project} />

        {/* Phase notes (static, no async fetch) */}
        <PhaseNotesStrip project={project} />

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
                  onClick={() => setActiveMonth(key)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    activeMonth === key ? "text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/8"
                  }`}
                  style={activeMonth === key ? { backgroundColor: "var(--brand-sienna)" } : undefined}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Weeks grid */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredWeeks.map(w => (
                <WeekCard key={w.weekKey} {...w} projectId={project.id} />
              ))}
            </div>
          </>
        )}
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
