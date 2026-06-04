"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { format, eachWeekOfInterval, addDays, parseISO, isValid } from "date-fns";
import { ArrowLeft, Camera, Plus, Trash2, Check, FileText, FileSpreadsheet, FileType2, Presentation, Download, ExternalLink, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Photo = {
  id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

type WeekProgress = {
  plan_pct: number;
  actual_pct: number;
  status: string;
};

type WeekEntry = {
  week: number;
  weekKey: string;   // e.g. "week-2026-06-02" (ISO date of Monday)
  monthKey: string;
  monthLabel: string;
  range: string;
};

type ProjectMeta = {
  pm_start: string | null;
  pm_end: string | null;
  start_date: string | null;
  end_date: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildWeeks(startRaw: string | null, endRaw: string | null): WeekEntry[] {
  const start = startRaw ? parseISO(startRaw) : null;
  const end   = endRaw   ? parseISO(endRaw)   : null;
  if (!start || !isValid(start) || !end || !isValid(end) || start > end) return [];

  const mondays = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return mondays.map((mon, i) => {
    const sun     = addDays(mon, 6);
    const weekEnd = sun > end ? end : sun;
    return {
      week:       i + 1,
      weekKey:    `week-${format(mon, "yyyy-MM-dd")}`,
      monthKey:   format(mon, "MMM yyyy"),
      monthLabel: format(mon, "MMMM yyyy"),
      range:      `${format(mon, "d MMM")} – ${format(weekEnd, "d MMM")}`,
    };
  });
}

const STATUS_OPTIONS = ["Not started", "On progress", "Completed", "Delayed"];

function getFileType(fileName: string, mimeType: string | null): "image" | "pdf" | "spreadsheet" | "document" | "presentation" | "other" {
  if ((mimeType ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName)) return "image";
  if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName)) return "pdf";
  if (/\.(xlsx|xls|csv|ods)$/i.test(fileName)) return "spreadsheet";
  if (/\.(docx|doc|odt|rtf|txt)$/i.test(fileName)) return "document";
  if (/\.(pptx|ppt|odp)$/i.test(fileName)) return "presentation";
  return "other";
}

function FileTypeIcon({ type, size = 40 }: { type: ReturnType<typeof getFileType>; size?: number }) {
  if (type === "spreadsheet")  return <FileSpreadsheet size={size} className="text-emerald-500" />;
  if (type === "document")     return <FileType2 size={size} className="text-blue-500" />;
  if (type === "presentation") return <Presentation size={size} className="text-orange-500" />;
  if (type === "pdf")          return <FileText size={size} className="text-red-500" />;
  return <FileText size={size} className="text-slate-400" />;
}

function getOfficeViewerUrl(fileUrl: string): string {
  const absolute = fileUrl.startsWith("http")
    ? fileUrl
    : `${typeof window !== "undefined" ? window.location.origin : ""}${fileUrl}`;
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absolute)}`;
}

function StatField({ label, value, onSave, color }: {
  label: string; value: string; onSave: (v: string) => void; color?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");

  function start() { setDraft(value === "—" ? "" : value.replace("%", "")); setEditing(true); }
  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    onSave(trimmed === "" ? "" : trimmed);
  }

  if (editing) {
    return (
      <div className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5">
        <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="number" step="0.01" min="0" max="100"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 dark:text-slate-200 border-b border-brand-sienna focus:border-brand-sienna"
          />
          <span className="text-xs text-slate-400">%</span>
          <button onMouseDown={commit} className="ml-1 text-brand-sienna"><Check size={12} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={start}
      className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/6 transition-colors group"
    >
      <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${color ?? "text-slate-700 dark:text-slate-200"}`}>{value}</p>
    </div>
  );
}

// ─── WeekCard ─────────────────────────────────────────────────────────────────
function WeekCard({ week, weekKey, range, projectId }: WeekEntry & { projectId: string }) {
  const [photos, setPhotos]         = useState<Photo[]>([]);
  const [uploading, setUploading]   = useState(false);
  const [lightbox, setLightbox]         = useState<Photo | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Photo | null>(null);
  const [replacing, setReplacing]       = useState(false);
  const [progress, setProgress]     = useState<WeekProgress>({ plan_pct: 0, actual_pct: 0, status: "Not started" });
  const [editStatus, setEditStatus] = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const plan     = progress.plan_pct;
  const actual   = progress.actual_pct;
  const variance = Number((actual - plan).toFixed(2));

  useEffect(() => {
    fetch(`/api/projects/${projectId}/attachments?week_key=${weekKey}`)
      .then(r => r.json()).then(j => { if (j.success) setPhotos(j.data); }).catch(() => {});
    fetch(`/api/projects/${projectId}/week-progress`)
      .then(r => r.json()).then(j => {
        if (j.success) {
          const row = j.data.find((d: { week_key: string }) => d.week_key === weekKey);
          if (row) setProgress({ plan_pct: Number(row.plan_pct), actual_pct: Number(row.actual_pct), status: row.status ?? "Not started" });
        }
      }).catch(() => {});
  }, [projectId, weekKey]);

  async function saveProgress(patch: Partial<WeekProgress>) {
    const next = { ...progress, ...patch };
    setProgress(next);
    await fetch(`/api/projects/${projectId}/week-progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_key: weekKey, plan_pct: next.plan_pct, actual_pct: next.actual_pct, status: next.status }),
    });
  }

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
        if (data.success) setPhotos(prev => [...prev, data.data]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(photoId: string) {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    setLightbox(null);
    await fetch(`/api/projects/${projectId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: photoId }),
    });
  }

  async function handleReplace(file: File) {
    if (!lightbox) return;
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("week_key", weekKey);
      const res  = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        await fetch(`/api/projects/${projectId}/attachments`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId: lightbox.id }),
        });
        setPhotos(prev => [...prev.filter(p => p.id !== lightbox.id), data.data]);
        setLightbox(data.data);
      }
    } finally {
      setReplacing(false);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }


  return (
    <>
      <div className="rounded-xl border border-slate-200/70 dark:border-white/8 overflow-hidden">
        {/* Week header */}
        <div className="px-4 py-2.5 flex items-center gap-3" style={{ backgroundColor: "rgba(251,191,36,0.14)" }}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400">Week {week}</span>
          <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-500/80">{range}</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600/60 dark:text-amber-500/50">
            <Camera size={10} />
            {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "No photos"}
          </span>
        </div>

        <div className="p-3 space-y-3 bg-white/40 dark:bg-zinc-900/20">
          {/* Photo area */}
          {photos.length === 0 ? (
            <div
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 py-8 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600 cursor-pointer hover:border-brand-sienna/50 hover:bg-brand-cream/10 dark:hover:bg-brand-sienna/5 transition-all group"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-brand-sienna/30 border-t-brand-sienna rounded-full animate-spin" />
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/8 flex items-center justify-center group-hover:bg-brand-cream/40 dark:group-hover:bg-brand-sienna/10 transition-colors">
                    <Plus size={16} className="text-slate-400 group-hover:text-brand-sienna transition-colors" />
                  </div>
                  <p className="text-[10px] font-medium">Click to add file</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {photos.map(photo => {
                const isImage = (photo.mime_type ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(photo.file_name);
                return (
                  <div
                    key={photo.id}
                    onClick={() => setLightbox(photo)}
                    className="relative group w-22 h-22 rounded-lg overflow-hidden border border-slate-200/60 dark:border-white/8 bg-slate-100 dark:bg-white/5 shrink-0 cursor-pointer flex items-center justify-center"
                  >
                    {isImage ? (
                      <img
                        src={photo.file_url}
                        alt={photo.file_name}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 px-2 text-center">
                        <FileText size={22} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate w-full text-center leading-tight">
                          {photo.file_name.split(".").pop()?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                  </div>
                );
              })}
              {/* Add more */}
              <div
                onClick={() => fileRef.current?.click()}
                className="w-22 h-22 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 flex items-center justify-center cursor-pointer hover:border-brand-sienna/50 hover:bg-brand-cream/10 dark:hover:bg-brand-sienna/5 transition-all group shrink-0"
              >
                {uploading
                  ? <div className="w-4 h-4 border-2 border-brand-sienna/30 border-t-brand-sienna rounded-full animate-spin" />
                  : <Plus size={16} className="text-slate-300 dark:text-white/20 group-hover:text-brand-sienna transition-colors" />
                }
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />

          {/* Progress stats — editable */}
          <div className="grid grid-cols-3 gap-2">
            <StatField
              label="Progress Plan"
              value={plan > 0 ? `${plan.toFixed(2)}%` : "—"}
              onSave={v => saveProgress({ plan_pct: v === "" ? 0 : Number(v) })}
            />
            <StatField
              label="Actual Progress"
              value={actual > 0 ? `${actual.toFixed(2)}%` : "—"}
              color={actual <= 0 ? "text-slate-400 dark:text-slate-600" : actual >= plan ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
              onSave={v => saveProgress({ actual_pct: v === "" ? 0 : Number(v) })}
            />
            <div className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Variance</p>
              <p className={`text-sm font-bold ${variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"}`}>
                {actual > 0 ? `${variance > 0 ? "+" : ""}${variance.toFixed(2)}%` : "—"}
              </p>
            </div>
          </div>

          {/* Status — editable dropdown */}
          <div className="flex items-center gap-2">
            {editStatus ? (
              <select
                autoFocus
                value={progress.status}
                onChange={e => { saveProgress({ status: e.target.value }); setEditStatus(false); }}
                onBlur={() => setEditStatus(false)}
                className="text-[10px] font-semibold rounded-full px-2.5 py-1 border border-brand-sienna/40 bg-white dark:bg-zinc-900 text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <button
                onClick={() => setEditStatus(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all hover:ring-2 hover:ring-brand-sienna/30 ${
                  progress.status === "On progress"   ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : progress.status === "Completed"   ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : progress.status === "Not started" ? "bg-slate-100 dark:bg-white/5 text-slate-400"
                  :                                     "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  progress.status === "On progress"   ? "bg-blue-500"
                  : progress.status === "Completed"   ? "bg-emerald-500"
                  : progress.status === "Not started" ? "bg-slate-400"
                  :                                     "bg-amber-500"
                }`} />
                {progress.status}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden replace input */}
      <input
        ref={replaceRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleReplace(e.target.files[0]); }}
      />

      {/* Lightbox / File preview */}
      {lightbox && typeof document !== "undefined" && createPortal((() => {
        const fileType = getFileType(lightbox.file_name, lightbox.mime_type);
        const isImage  = fileType === "image";
        const isPdf    = fileType === "pdf";

        return (
          <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
            onMouseDown={e => { if (e.target === e.currentTarget) setLightbox(null); }}
          >
            {isImage ? (
              /* ── Image lightbox ── */
              <div className="relative max-w-4xl w-full animate-modal-enter overflow-hidden rounded-xl" onClick={e => e.stopPropagation()}>
                <img src={lightbox.file_url} alt={lightbox.file_name} className="w-full max-h-[90vh] object-contain rounded-xl block" />
                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-white text-xs font-medium">{lightbox.file_name}</p>
                    {lightbox.uploaded_by_name && <p className="text-white/60 text-[10px]">Uploaded by {lightbox.uploaded_by_name}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => replaceRef.current?.click()} disabled={replacing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors disabled:opacity-50">
                      {replacing ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={12} />}
                      Replace
                    </button>
                    <button onClick={() => setDeleteConfirm(lightbox)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
                <button onClick={() => setLightbox(null)} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors text-sm leading-none">✕</button>
              </div>
            ) : isPdf ? (
              /* ── PDF embed ── */
              <div className="relative w-full max-w-4xl h-[88vh] bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-white/8 overflow-hidden animate-modal-enter" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 dark:border-white/8">
                  <FileText size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs font-bold text-slate-700 dark:text-white flex-1 truncate">{lightbox.file_name}</p>
                  {lightbox.uploaded_by_name && <p className="text-[10px] text-slate-400 shrink-0">by {lightbox.uploaded_by_name}</p>}
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <button onClick={() => replaceRef.current?.click()} disabled={replacing}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors disabled:opacity-50">
                      {replacing ? <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" /> : <Plus size={11} />}
                      Replace
                    </button>
                    <button onClick={() => setDeleteConfirm(lightbox)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold transition-colors">
                      <Trash2 size={11} /> Delete
                    </button>
                    <button onClick={() => setLightbox(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors ml-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <iframe src={lightbox.file_url} className="w-full h-[calc(100%-48px)] border-0" title={lightbox.file_name} />
              </div>
            ) : (
              /* ── Generic file preview card ── */
              <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-white/8 overflow-hidden animate-modal-enter" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8">
                  <FileTypeIcon type={fileType} size={16} />
                  <p className="text-sm font-bold text-slate-800 dark:text-white flex-1 truncate">{lightbox.file_name}</p>
                  <button onClick={() => setLightbox(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="p-6 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center">
                    <FileTypeIcon type={fileType} size={32} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-all">{lightbox.file_name}</p>
                    {lightbox.uploaded_by_name && <p className="text-[10px] text-slate-400 mt-1">Uploaded by {lightbox.uploaded_by_name}</p>}
                  </div>
                  <a href={lightbox.file_url} download={lightbox.file_name}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-colors"
                    style={{ backgroundColor: "var(--brand-sienna)" }}>
                    <Download size={12} /> Download
                  </a>
                </div>
                <div className="px-5 py-4 border-t border-slate-200/60 dark:border-white/8 flex justify-end gap-2">
                  <button onClick={() => replaceRef.current?.click()} disabled={replacing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/8 hover:bg-slate-200 dark:hover:bg-white/12 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50">
                    {replacing ? <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" /> : <Plus size={11} />}
                    Replace
                  </button>
                  <button onClick={() => setDeleteConfirm(lightbox)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })(), document.body)}

      {/* ── Delete confirmation ── */}
      {deleteConfirm && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-backdrop-enter"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 p-6 space-y-4 animate-modal-enter" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Delete attachment?</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{deleteConfirm.file_name}</span> will be permanently deleted.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDelete(deleteConfirm.id); setDeleteConfirm(null); }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WeeklyProgressPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProject(json.data.project); })
      .finally(() => setLoading(false));
  }, [id]);

  const startDate = project?.pm_start ?? project?.start_date ?? null;
  const endDate   = project?.pm_end   ?? project?.end_date   ?? null;
  const weeks     = buildWeeks(startDate, endDate);
  const months    = Array.from(new Map(weeks.map(w => [w.monthKey, w.monthLabel])).entries());
  const [activeKey, setActiveKey] = useState<string>("");

  useEffect(() => {
    if (months.length > 0 && !activeKey) {
      setActiveKey(months[months.length - 1][0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const filtered = weeks.filter(w => w.monthKey === activeKey);

  return (
    <div className="space-y-4 pb-10 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
            <Camera size={14} className="shrink-0" style={{ color: "var(--brand-sienna)" }} />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Weekly Progress</h3>
          </div>

          {weeks.length === 0 ? (
            <div className="p-8 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600">
              <Camera size={20} className="opacity-40" />
              <p className="text-xs">Set project start &amp; end dates to generate weekly progress cards.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-200/50 dark:border-white/8 bg-slate-50/50 dark:bg-white/2 flex-wrap">
                {months.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveKey(key)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      activeKey === key
                        ? "text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                    style={activeKey === key ? { backgroundColor: "var(--brand-sienna)" } : undefined}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                  {filtered.length} week{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-4 space-y-3">
                {filtered.map(w => (
                  <WeekCard key={w.weekKey} {...w} projectId={id} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
