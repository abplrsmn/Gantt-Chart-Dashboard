"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, eachWeekOfInterval, addDays, parseISO, isValid } from "date-fns";
import { BarChart2, Camera, Search, ChevronDown, Plus, X } from "lucide-react";

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
};

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

// ─── WeekCard ─────────────────────────────────────────────────────────────────
function WeekCard({ week, weekKey, range, projectId }: WeekEntry & { projectId: string }) {
  const [photos, setPhotos]       = useState<Photo[]>([]);
  const [progress, setProgress]   = useState<WeekProgress | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox]   = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("week_key", weekKey);
        const res  = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: fd });
        const data = await res.json();
        if (data.success && data.data) setPhotos(prev => [...prev, data.data]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    await fetch(`/api/projects/${projectId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: photoId }),
    });
  }

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

      {/* Photos area */}
      <div className="bg-slate-50/50 dark:bg-white/2">
        {photos.length > 0 ? (
          <div className="flex gap-1.5 p-2.5 flex-wrap">
            {photos.map((photo, pi) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.file_url}
                  alt={photo.file_name}
                  onClick={() => setLightbox(photo)}
                  className="w-20 h-16 object-cover rounded-lg border border-slate-200/60 dark:border-white/8 cursor-zoom-in"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {/* delete on hover */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(photo.id); }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={8} />
                </button>
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
            {/* Add more */}
            <label className="w-20 h-16 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 flex items-center justify-center cursor-pointer hover:border-brand-sienna/50 hover:bg-brand-cream/10 dark:hover:bg-brand-sienna/5 transition-all group shrink-0">
              {uploading
                ? <div className="w-4 h-4 border-2 border-brand-sienna/30 border-t-brand-sienna rounded-full animate-spin" />
                : <Plus size={14} className="text-slate-300 dark:text-white/20 group-hover:text-brand-sienna transition-colors" />}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            </label>
          </div>
        ) : (
          <label className="px-3 py-3 flex items-center gap-2 text-slate-400 dark:text-slate-600 text-[11px] cursor-pointer hover:text-brand-sienna dark:hover:text-brand-sienna hover:bg-amber-50/30 dark:hover:bg-brand-sienna/5 transition-colors">
            {uploading
              ? <div className="w-3.5 h-3.5 border-2 border-brand-sienna/30 border-t-brand-sienna rounded-full animate-spin" />
              : <Camera size={11} />}
            <span>{uploading ? "Uploading…" : "No photos — click to add"}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          </label>
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
  const bodyRef      = useRef<HTMLDivElement>(null);
  const firstRender  = useRef(true);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    if (expanded) {
      if (firstRender.current) {
        // Initial mount already open — no animation needed, just allow free height
        firstRender.current = false;
        el.style.maxHeight = "none";
        return;
      }
      // Re-expanding after collapse — animate from 0 → scrollHeight → none
      el.style.maxHeight = `${el.scrollHeight}px`;
      const onEnd = () => { el.style.maxHeight = "none"; };
      el.addEventListener("transitionend", onEnd, { once: true });
      return () => el.removeEventListener("transitionend", onEnd);
    } else {
      firstRender.current = false;
      // Collapsing — if currently unconstrained, capture real height first
      if (!el.style.maxHeight || el.style.maxHeight === "none") {
        el.style.maxHeight = `${el.scrollHeight}px`;
      }
      requestAnimationFrame(() => { el.style.maxHeight = "0px"; });
    }
  }, [expanded]);

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
            {project.current_phase_name && <span className="text-xs text-slate-500 dark:text-slate-400">Phase: <span className="font-medium">{project.current_phase_name}</span></span>}
            {getCurrentPic(project) && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PIC: <span className="font-medium text-slate-700 dark:text-slate-200">{getCurrentPic(project)}</span>
              </span>
            )}
            {weeks.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">{weeks.length} weeks</span>}
          </div>
        </div>
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
        style={{ overflow: "hidden", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)" }}
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

            {/* Weeks grid — each WeekCard manages its own data & upload */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredWeeks.map(w => (
                <WeekCard key={w.weekKey} {...w} projectId={project.id} />
              ))}
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
