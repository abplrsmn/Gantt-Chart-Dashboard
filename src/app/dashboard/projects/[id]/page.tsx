"use client";

import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronRight, ChevronDown,
  User, Users, Building2,
  Activity, Clock, FileText, MapPin, Pencil,
  Camera, Trash2, Loader2, X, Plus
} from "lucide-react";
import SCurveCharts from "@/components/dashboard/SCurveCharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProjectDetail = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_capex: string | null;
  contract_amount: string | null;
  summary_brief: string | null;
  address: string | null;
  blocker_note: string | null;
  next_action_note: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  status_label: string | null;
  status_color: string | null;
  priority_name: string | null;
  priority_code: string | null;
  priority_color: string | null;
  unit_code: string | null;
  unit_name: string | null;
  category_name: string | null;
  brief_deadline: string | null;
  brief_received: string | null;
  brief_progress: string | null;
  brief_notes: string | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: string | null;
  working_drawing_status: string | null;
  design_notes: string | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: string | null;
  phase_contract_amount: string | null;
  control_notes: string | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_progress: string | null;
  deviation_days: string | null;
  current_site_progress: string | null;
  pm_notes: string | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: string | null;
  actual_phase_completion_date: string | null;
  handover_notes: string | null;
};

type PersonRow = {
  id: string;
  raw_person_name: string | null;
  raw_organization_name: string | null;
  is_primary: boolean;
  notes: string | null;
  phase_id: number | null;
  role_code: string | null;
  role_name: string | null;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  file_url: string | null;
  file_size_bytes: string | null;
  source_channel: string | null;
  source_message_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  phase_name: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
}

function fmtCurrency(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function toInputValue(fmt: FieldDef["format"], raw: string | null): string {
  if (!raw) return "";
  if (fmt === "date") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(raw);
}

// ─── InlineField ──────────────────────────────────────────────────────────────
function InlineField({
  label, value, format: fmt, fullWidth, onSave,
}: {
  label: string;
  value: string | null;
  format: FieldDef["format"];
  fullWidth?: boolean;
  onSave: (raw: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setDraft(toInputValue(fmt, value));
    setEditing(true);
    setTimeout(() => (fullWidth ? taRef.current?.focus() : inputRef.current?.focus()), 0);
  }

  async function commit() {
    setEditing(false);
    const raw = draft.trim() === "" ? null : draft.trim();
    setSaving(true);
    try { await onSave(raw); } finally { setSaving(false); }
  }

  const displayVal =
    !value ? "—"
    : fmt === "date" ? fmtDate(value)
    : fmt === "currency" ? fmtCurrency(value)
    : String(value);

  const wrapCls = fullWidth ? "col-span-2" : "";
  const labelEl = <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>;
  const inputCls = "w-full bg-white dark:bg-zinc-800 border border-cyan-400 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 outline-none ring-2 ring-cyan-400/30";

  if (editing) {
    return (
      <div className={wrapCls}>
        {labelEl}
        {fullWidth ? (
          <textarea
            ref={taRef}
            value={draft}
            rows={3}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Escape") setEditing(false); if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(); }}
            className={inputCls + " resize-none"}
          />
        ) : (
          <input
            ref={inputRef}
            type={fmt === "date" ? "date" : "text"}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") commit(); }}
            className={inputCls}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`group cursor-pointer ${wrapCls}`} onClick={startEdit}>
      {labelEl}
      <div className="flex items-center gap-1">
        <p className={`font-semibold ${fullWidth ? "text-[11px] leading-relaxed" : "text-xs"} ${displayVal === "—" ? "text-slate-500 dark:text-slate-600 italic" : "text-slate-700 dark:text-slate-200"} group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors ${saving ? "opacity-50" : ""}`}>
          {displayVal}
        </p>
        <Pencil size={9} className="text-slate-400 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </div>
    </div>
  );
}

// ─── InlineText (for standalone editable labels like project name) ─────────────
function InlineText({
  value, onSave, className, multiline,
}: {
  value: string | null;
  onSave: (raw: string | null) => Promise<void>;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => (multiline ? taRef.current?.focus() : inputRef.current?.focus()), 0);
  }

  async function commit() {
    setEditing(false);
    await onSave(draft.trim() || null);
  }

  const inputCls = "bg-white dark:bg-zinc-800 border border-cyan-400 rounded px-2 py-0.5 outline-none ring-2 ring-cyan-400/30 w-full " + (className ?? "");

  if (editing) {
    return multiline ? (
      <textarea ref={taRef} value={draft} rows={3} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(); }}
        className={inputCls + " resize-none text-sm"} />
    ) : (
      <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") commit(); }}
        className={inputCls} />
    );
  }

  return (
    <span className={`group inline-flex items-center gap-1.5 cursor-pointer`} onClick={startEdit}>
      <span className={`${className} group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors`}>
        {value || <span className="italic text-slate-400">—</span>}
      </span>
      <Pencil size={10} className="text-slate-400 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </span>
  );
}

type FieldDef = {
  label: string;
  key: keyof ProjectDetail;
  format: "date" | "currency" | "text";
  fullWidth?: boolean;
};

type PhaseDef = {
  key: string;
  phaseId: number;
  phaseCode: string;
  label: string;
  color: string;
  weight: number;
  progressKey: keyof ProjectDetail;
  startKey: keyof ProjectDetail;
  endKey: keyof ProjectDetail;
  fields: FieldDef[];
};

const PHASE_DEFS: PhaseDef[] = [
  {
    key: "brief", phaseId: 1, phaseCode: "operational_brief",
    label: "Operational Brief", color: "#64748b", weight: 10,
    progressKey: "brief_progress",
    startKey: "brief_received", endKey: "brief_deadline",
    fields: [
      { label: "Brief Received",  key: "brief_received", format: "date" },
      { label: "Brief Deadline",  key: "brief_deadline", format: "date" },
      { label: "Notes",           key: "brief_notes",    format: "text", fullWidth: true },
    ],
  },
  {
    key: "design", phaseId: 2, phaseCode: "design",
    label: "Design", color: "#3b82f6", weight: 20,
    progressKey: "design_progress",
    startKey: "design_start", endKey: "design_end",
    fields: [
      { label: "Start Design",    key: "design_start",           format: "date" },
      { label: "Design Approval", key: "design_end",             format: "date" },
      { label: "Working Drawing", key: "working_drawing_status", format: "text", fullWidth: true },
      { label: "Notes",           key: "design_notes",           format: "text", fullWidth: true },
    ],
  },
  {
    key: "control", phaseId: 3, phaseCode: "project_control",
    label: "Project Control", color: "#f59e0b", weight: 15,
    progressKey: "control_progress",
    startKey: "control_start", endKey: "control_end",
    fields: [
      { label: "Tender Start",     key: "control_start",         format: "date" },
      { label: "SPK Released",     key: "control_end",           format: "date" },
      { label: "Contract Amount",  key: "phase_contract_amount", format: "currency", fullWidth: true },
      { label: "Notes",            key: "control_notes",         format: "text",     fullWidth: true },
    ],
  },
  {
    key: "pm", phaseId: 4, phaseCode: "project_management",
    label: "Project Management", color: "#14b8a6", weight: 45,
    progressKey: "pm_progress",
    startKey: "pm_start", endKey: "pm_end",
    fields: [
      { label: "Commence Date", key: "pm_start",              format: "date" },
      { label: "End Contract",  key: "pm_end",                format: "date" },
      { label: "Deviation Days",key: "deviation_days",        format: "text" },
      { label: "Site Progress", key: "current_site_progress", format: "text" },
      { label: "Notes",         key: "pm_notes",              format: "text", fullWidth: true },
    ],
  },
  {
    key: "handover", phaseId: 5, phaseCode: "handover",
    label: "Handover", color: "#22c55e", weight: 10,
    progressKey: "handover_progress",
    startKey: "handover_start", endKey: "handover_end",
    fields: [
      { label: "BAST 1",          key: "handover_start",               format: "date" },
      { label: "BAST 2",          key: "handover_end",                 format: "date" },
      { label: "Completion Date", key: "actual_phase_completion_date", format: "date", fullWidth: true },
      { label: "Notes",           key: "handover_notes",               format: "text", fullWidth: true },
    ],
  },
];

function PhaseCard({ ph, project, isCurrent, isPast, people, onSave }: {
  ph: PhaseDef;
  project: ProjectDetail;
  isCurrent: boolean;
  isPast: boolean;
  people: PersonRow[];
  onSave: (key: keyof ProjectDetail, value: string | null) => Promise<void>;
}) {
  const phasePeople = people.filter(p => Number(p.phase_id) === ph.phaseId);
  const assignedBy  = phasePeople.filter(p => p.role_code === "pic");

  return (
    <div
      className="relative rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: isCurrent ? ph.color : isPast ? `${ph.color}28` : "rgba(255,255,255,0.06)",
        borderWidth: isCurrent ? 2 : 1,
        boxShadow: isCurrent ? `0 0 0 3px ${ph.color}20, 0 14px 34px ${ph.color}24` : "none",
        opacity: !isCurrent && !isPast ? 0.58 : 1,
      }}
    >
      {isCurrent && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: ph.color }} />
      )}
      <div
        className="flex items-center gap-3 px-3.5 py-3"
        style={{ backgroundColor: isCurrent ? `${ph.color}24` : isPast ? `${ph.color}0a` : `${ph.color}06` }}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-4" style={{ backgroundColor: ph.color, opacity: isCurrent ? 1 : 0.5, boxShadow: isCurrent ? `0 0 16px ${ph.color}` : "none", ['--tw-ring-color' as string]: isCurrent ? `${ph.color}30` : "transparent" }} />
        <span className="flex-1 text-xs font-bold uppercase tracking-wider" style={{ color: isCurrent ? ph.color : `${ph.color}99` }}>
          {ph.label}
          {isCurrent && (
            <span className="ml-2 text-[8px] font-extrabold px-2 py-0.5 rounded-full align-middle text-white shadow-sm" style={{ backgroundColor: ph.color }}>
              CURRENT PHASE
            </span>
          )}
        </span>
      </div>

      <div className="px-4 py-3 bg-white/40 dark:bg-zinc-900/30 space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {ph.fields.filter(f => f.label !== "Notes").map(f => (
            <InlineField
              key={f.key as string}
              label={f.label}
              value={project[f.key] as string | null}
              format={f.format}
              fullWidth={f.fullWidth}
              onSave={v => onSave(f.key, v)}
            />
          ))}

          <div className="col-span-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Assigned By</p>
            {assignedBy.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {assignedBy.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/6 px-2 py-0.5 rounded-md">
                    <User size={9} className="text-slate-400 shrink-0" />
                    {a.full_name ?? a.raw_person_name ?? "—"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] italic text-slate-400 dark:text-slate-600">—</p>
            )}
          </div>
        </div>

        {ph.fields.filter(f => f.label === "Notes").map(f => (
          <div key={f.key as string} className="pt-2 border-t border-slate-200/40 dark:border-white/6">
            <InlineField
              label="Notes"
              value={project[f.key] as string | null}
              format={f.format}
              fullWidth
              onSave={v => onSave(f.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [people, setPeople]   = useState<PersonRow[]>([]);
  const [, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exitingConfirm,    setExitingConfirm]    = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function closeDeleteConfirm() {
    setExitingConfirm(true);
    setTimeout(() => { setExitingConfirm(false); setShowDeleteConfirm(false); }, 200);
  }
  const [newStakeholder, setNewStakeholder] = useState("");
  const [addingStakeholder, setAddingStakeholder] = useState(false);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const [statusOptions, setStatusOptions] = useState<{ id: number; name: string; color: string }[]>([]);
  const [phaseNoteModal, setPhaseNoteModal] = useState<{ nextPhase: typeof PHASE_DEFS[number] } | null>(null);
  const [phaseNote, setPhaseNote] = useState("");

  useEffect(() => {
    fetch("/api/master/options")
      .then(r => r.json())
      .then(d => { if (d.success) setStatusOptions(d.statuses ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setProject(json.data.project);
          setPeople(json.data.people);
          setAttachments(json.data.attachments ?? []);
        } else {
          setError(json.error ?? "Unknown error");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function patchField(key: keyof ProjectDetail, value: string | null) {
    setProject(prev => prev ? { ...prev, [key]: value } : prev);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: key, value }),
    });
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setDeleteError(data.error ?? "Failed to delete project."); return; }
      router.push("/dashboard/projects/gantt");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function addStakeholder() {
    if (!newStakeholder.trim()) return;
    setAddingStakeholder(true);
    try {
      const res = await fetch(`/api/projects/${id}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_person_name: newStakeholder.trim(), role_code: "stakeholder" }),
      });
      const data = await res.json();
      if (data.success) {
        setPeople(prev => [...prev, { id: data.data.id, raw_person_name: data.data.raw_person_name, raw_organization_name: null, is_primary: false, notes: null, phase_id: null, role_code: "stakeholder", role_name: "Stakeholder", full_name: null, job_title: null, department: null, email: null }]);
        setNewStakeholder("");
      }
    } finally {
      setAddingStakeholder(false);
    }
  }

  async function removeStakeholder(personRowId: string) {
    setPeople(prev => prev.filter(p => p.id !== personRowId));
    await fetch(`/api/projects/${id}/people`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personRowId }),
    });
  }


  const scProject = useMemo(() => {
    if (!project) return null;
    return {
      id: project.id,
      project_name: project.project_name,
      start_date: project.start_date,
      end_date: project.end_date,
      brief_received: project.brief_received,
      brief_deadline: project.brief_deadline,
      brief_progress: Number(project.brief_progress ?? 0),
      design_start: project.design_start,
      design_end: project.design_end,
      design_progress: Number(project.design_progress ?? 0),
      control_start: project.control_start,
      control_end: project.control_end,
      control_progress: Number(project.control_progress ?? 0),
      pm_start: project.pm_start,
      pm_end: project.pm_end,
      pm_progress: Number(project.pm_progress ?? 0),
      handover_start: project.handover_start,
      handover_end: project.handover_end,
      handover_progress: Number(project.handover_progress ?? 0),
      unit_name: project.unit_name,
      unit_code: project.unit_code,
      overall_progress_pct: project.overall_progress_pct,
      current_phase_code: project.current_phase_code,
    };
  }, [project]);

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="glass-card p-16 text-center space-y-3">
        <p className="text-sm font-semibold text-red-400">{error ?? "Project not found"}</p>
        <button onClick={() => router.back()} className="text-xs text-cyan-500 underline">
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/projects/${id}/weekly-progress`)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-zinc-900/80 transition-all text-xs font-semibold"
          >
            <Camera size={13} />
            Weekly Progress
          </button>
          <button
            onClick={() => router.push(`/dashboard/projects/${id}/audit`)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-zinc-900/80 transition-all text-xs font-semibold"
          >
            <Clock size={13} />
            View Audit Log
          </button>
          <button
            onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/80 dark:bg-rose-500/8 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:border-rose-300 dark:hover:border-rose-500/40 transition-all text-xs font-semibold"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ───────────────────────────────────── */}
      {showDeleteConfirm && typeof document !== "undefined" && createPortal(
        <div
          className={`fixed inset-0 z-9999 flex items-center justify-center p-4 ${exitingConfirm ? "animate-backdrop-exit" : "animate-backdrop-enter"}`}
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget && !deleting) closeDeleteConfirm(); }}
        >
          <div className={`w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 shadow-2xl p-6 space-y-4 ${exitingConfirm ? "animate-modal-exit" : "animate-modal-enter"}`}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 size={18} className="text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Delete project?</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{project.project_name}</span> will be permanently deleted along with all its phases, tasks, attachments, and change logs. This cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-xs text-rose-500 font-medium bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded-lg">{deleteError}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={closeDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {deleting ? "Deleting…" : "Yes, delete it"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Status picker dropdown (portalled to escape overflow-hidden) ── */}
      {showStatusPicker && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-9997" onMouseDown={() => setShowStatusPicker(false)} />
          <div
            className="fixed z-9998 bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 rounded-xl shadow-xl p-1.5 flex flex-col gap-0.5 min-w-32.5 animate-dropdown-enter"
            style={(() => {
              const r = statusBtnRef.current?.getBoundingClientRect();
              return r ? { top: r.bottom + 6, left: r.left } : { top: 0, left: 0 };
            })()}
          >
            {statusOptions.map(s => (
              <button
                key={s.id}
                onMouseDown={async () => {
                  setShowStatusPicker(false);
                  setProject(prev => prev ? { ...prev, status_label: s.name, status_color: s.color } : prev);
                  await fetch(`/api/projects/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ field: "status_label", value: s.name, change_summary: `Status → ${s.name}`, action_type: "field_updated" }),
                  });
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/6 text-left w-full"
                style={{ color: s.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
                {s.name === project.status_label && <span className="ml-auto text-[9px]">✓</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* ── Phase advance note modal ────────────────────────────────── */}
      {phaseNoteModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setPhaseNoteModal(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 shadow-2xl p-6 space-y-4 animate-modal-enter">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${phaseNoteModal.nextPhase.color}20` }}>
                <ChevronRight size={18} style={{ color: phaseNoteModal.nextPhase.color }} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  Proceed to {phaseNoteModal.nextPhase.label}?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tambahkan catatan alasan sebelum melanjutkan ke fase berikutnya.
                </p>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block">
                Note / Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                autoFocus
                value={phaseNote}
                onChange={e => setPhaseNote(e.target.value)}
                rows={3}
                placeholder="e.g. Design approved by stakeholders, ready to proceed..."
                className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPhaseNoteModal(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!phaseNote.trim()}
                onClick={async () => {
                  const { nextPhase } = phaseNoteModal;
                  setPhaseNoteModal(null);
                  setProject(prev => prev ? { ...prev, current_phase_code: nextPhase.phaseCode, current_phase_name: nextPhase.label } : prev);
                  await fetch(`/api/projects/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ field: "current_phase_id", value: String(nextPhase.phaseId), change_summary: `Proceed to ${nextPhase.label}: ${phaseNote.trim()}`, action_type: "phase_advanced" }),
                  });
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: phaseNoteModal.nextPhase.color }}
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Project Description ──────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
          <FileText size={13} className="text-cyan-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Project Description</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200/50 dark:divide-white/8">

          {/* ── Left ── */}
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Project Name</p>
              <InlineText
                value={project.project_name}
                onSave={v => patchField("project_name", v)}
                className="text-base font-bold text-slate-700 dark:text-slate-200 leading-snug"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Project ID</p>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded inline-block">
                {project.project_code}
              </p>
            </div>
            <div className="flex items-start gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Priority</p>
                {project.priority_name ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: `${project.priority_color}20`, color: project.priority_color ?? undefined, border: "1.5px solid transparent" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.priority_color ?? undefined }} />
                    {project.priority_name}
                  </span>
                ) : (
                  <span className="text-xs italic text-slate-400 dark:text-slate-600">—</span>
                )}
              </div>
              <div onClick={e => e.stopPropagation()}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Status</p>
                {(() => {
                  const active = statusOptions.find(s => s.name === project.status_label) ?? statusOptions[0];
                  if (!active) return <span className="text-xs italic text-slate-400">—</span>;
                  return (
                    <button
                      ref={statusBtnRef}
                      onClick={e => { e.stopPropagation(); setShowStatusPicker(v => !v); }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md transition-all"
                      style={{ backgroundColor: `${active.color}22`, color: active.color, border: `1.5px solid ${active.color}60` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
                      {active.name}
                      <ChevronDown size={10} />
                    </button>
                  );
                })()}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Summary</p>
              <InlineText
                value={project.summary_brief}
                onSave={v => patchField("summary_brief", v)}
                className="text-xs text-slate-600 dark:text-slate-300"
                multiline
              />
            </div>
          </div>

          {/* ── Right ── */}
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                  <Building2 size={11} className="text-slate-400" />
                  Location
                </p>
                <div className="px-3 py-2 rounded-lg border border-slate-200/70 dark:border-white/8 bg-white/60 dark:bg-white/3">
                  {project.unit_name || project.unit_code ? (
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {project.unit_name ?? project.unit_code}
                      {project.unit_name && project.unit_code ? (
                        <span className="ml-1 font-medium text-slate-400">({project.unit_code})</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs italic text-slate-400 dark:text-slate-600">Unit not specified</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                  <MapPin size={11} className="text-slate-400" />
                  Address
                </p>
                <textarea
                  rows={2}
                  defaultValue={project.address ?? ""}
                  onBlur={e => { const v = e.target.value.trim() || null; if (v !== (project.address ?? null)) patchField("address", v); }}
                  placeholder="Add address..."
                  className="w-full resize-none text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-brand-sienna/50 focus:ring-1 focus:ring-brand-sienna/20 transition-all"
                />
              </div>
            </div>

            {/* Stakeholders */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <Users size={11} className="text-slate-400" />
                Stakeholders
              </p>
              <div className="space-y-2">
                {people.some(p => p.role_code === "stakeholder") ? (
                  <div className="flex flex-wrap gap-1.5">
                    {people.filter(p => p.role_code === "stakeholder").map(s => (
                      <span key={s.id} className="group inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/6 px-2 py-1 rounded-md">
                        <Building2 size={10} className="text-slate-400 shrink-0" />
                        {s.full_name ?? s.raw_person_name ?? s.raw_organization_name ?? "—"}
                        <button onClick={() => removeStakeholder(s.id)} className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400 dark:text-slate-600">No stakeholders yet</p>
                )}
                {/* Add stakeholder inline */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newStakeholder}
                    onChange={e => setNewStakeholder(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addStakeholder(); }}
                    placeholder="Add stakeholder..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-brand-sienna/50 focus:ring-1 focus:ring-brand-sienna/20 transition-all"
                  />
                  <button
                    onClick={addStakeholder}
                    disabled={addingStakeholder || !newStakeholder.trim()}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/8 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/12 disabled:opacity-40 transition-colors"
                  >
                    {addingStakeholder ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Phase Parameters ─────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
          <Activity size={13} className="text-cyan-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Phase Parameters</h3>
          {(() => {
            const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
            const nextPhase  = currentIdx >= 0 && currentIdx < PHASE_DEFS.length - 1 ? PHASE_DEFS[currentIdx + 1] : null;
            if (!nextPhase) return null;
            return (
              <button
                onClick={() => { setPhaseNote(""); setPhaseNoteModal({ nextPhase }); }}
                className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all"
                style={{ backgroundColor: nextPhase.color }}
              >
                Proceed to {nextPhase.label}
                <ChevronRight size={12} />
              </button>
            );
          })()}
        </div>

        {/* Phase flow stepper */}
        <div className="px-4 pt-4 pb-4 border-b border-slate-200/50 dark:border-white/8">
          <div className="flex items-stretch gap-1">
            {PHASE_DEFS.map((ph, i) => {
              const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
              const isCurrent  = i === currentIdx;
              const hasData    = !!(project[ph.startKey] || project[ph.endKey]);
              const isPast     = i < currentIdx && hasData;
              const isSkipped  = i < currentIdx && !hasData;
              const isFuture   = i > currentIdx;
              const isNeutral  = isSkipped || isFuture;
              return (
                <Fragment key={ph.key}>
                  <div
                    className="relative flex-1 flex flex-col items-center justify-center px-2 py-2.5 rounded-xl text-center transition-all"
                    style={{
                      backgroundColor: isCurrent ? `${ph.color}34` : isPast ? `${ph.color}10` : "rgba(255,255,255,0.02)",
                      border: `2px solid ${isCurrent ? ph.color : isPast ? `${ph.color}35` : "rgba(255,255,255,0.06)"}`,
                      boxShadow: isCurrent ? `0 0 0 3px ${ph.color}22, 0 10px 26px ${ph.color}24` : "none",
                      transform: isCurrent ? "translateY(-1px)" : "none",
                      opacity: isNeutral ? 0.42 : 1,
                    }}
                  >
                    {isCurrent && (
                      <span
                        className="w-2.5 h-2.5 rounded-full mb-1 animate-pulse ring-4"
                        style={{
                          backgroundColor: ph.color,
                          boxShadow: `0 0 14px ${ph.color}`,
                          ['--tw-ring-color' as string]: `${ph.color}26`,
                        }}
                      />
                    )}
                    {isPast    && <span className="text-[9px] mb-1 leading-none" style={{ color: ph.color }}>✓</span>}
                    {isNeutral && <span className="text-[9px] mb-1 leading-none text-slate-600">○</span>}
                    <span
                      className="text-[8px] font-extrabold uppercase tracking-wider leading-tight block"
                      style={{ color: isCurrent ? ph.color : isPast ? `${ph.color}cc` : "#475569" }}
                    >
                      {ph.label}
                    </span>
                  </div>
                  {i < PHASE_DEFS.length - 1 && (
                    <div className="self-center shrink-0 text-slate-600 dark:text-slate-700">
                      <ChevronRight size={10} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Phase details */}
        <div className="p-4 space-y-2">
          {PHASE_DEFS.map((ph) => {
            const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
            const phIdx = PHASE_DEFS.findIndex(p => p.key === ph.key);
            return (
              <PhaseCard
                key={ph.key}
                ph={ph}
                project={project}
                isCurrent={project.current_phase_code === ph.phaseCode}
                isPast={phIdx < currentIdx}
                people={people}
                onSave={patchField}
              />
            );
          })}
        </div>
      </div>

      {/* ── S-Curve ────────────────────────────────────────────────────── */}
      {scProject && (
        <SCurveCharts projects={[scProject]} hidePhaseDetails />
      )}


    </div>
  );
}
