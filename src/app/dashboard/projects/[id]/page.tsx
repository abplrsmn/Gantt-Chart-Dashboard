"use client";

import { useEffect, useMemo, useRef, useState, Fragment, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronRight, ChevronDown,
  User, Users, Building2,
  Activity, Clock, FileText, MapPin, Pencil,
  Camera, Trash2, Loader2, X, Plus, Upload, CheckSquare, Square
} from "lucide-react";
import SCurveCharts from "@/components/dashboard/SCurveCharts";
import ScurveImportModal from "@/components/dashboard/ScurveImportModal";
import AnimatedDropdown from "@/components/dashboard/AnimatedDropdown";

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
  brief_phase_row_id: string | null;
  design_phase_row_id: string | null;
  control_phase_row_id: string | null;
  pm_phase_row_id: string | null;
  handover_phase_row_id: string | null;
  operational_brief: string | null;
  brief_deadline: string | null;
  brief_received: string | null;
  brief_progress: string | null;
  brief_notes: string | null;
  design_brief: string | null;
  design_start: string | null;
  design_approval_target: string | null;
  design_end: string | null;
  design_duration_days: string | null;
  design_progress: string | null;
  working_drawing_status: string | null;
  design_notes: string | null;
  control_start: string | null;
  aps_spk_target: string | null;
  control_end: string | null;
  project_control_duration_days: string | null;
  control_progress: string | null;
  aps_date: string | null;
  phase_contract_amount: string | null;
  control_notes: string | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_actual_end: string | null;
  pm_duration_days: string | null;
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

type TaskRow = {
  id: string;
  title: string;
  progress_pct: number;
  phase_id: string | null;
  raw_assignee_name: string | null;
  raw_assigned_by_name: string | null;
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
  phase_id: string | null;
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

function fmtBytes(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n) || n === 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
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
  label, value, format: fmt, fullWidth, onSave, readOnly, min, max,
}: {
  label: string;
  value: string | null;
  format: FieldDef["format"];
  fullWidth?: boolean;
  onSave: (raw: string | null) => Promise<void>;
  readOnly?: boolean;
  min?: string;
  max?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    if (readOnly) return;
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
    : fmt === "weeks" ? `${Math.round(Number(value) / 7)}w`
    : String(value);

  const wrapCls = fullWidth ? "col-span-2" : "";
  const labelEl = <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>;
  const inputCls = "w-full bg-white dark:bg-zinc-800 border border-amber-400 rounded px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 outline-none ring-2 ring-amber-400/30";

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
            onKeyDown={e => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); } }}
            className={inputCls + " resize-none"}
          />
        ) : (
          <input
            ref={inputRef}
            type={fmt === "date" ? "date" : "text"}
            value={draft}
            min={fmt === "date" ? min : undefined}
            max={fmt === "date" ? max : undefined}
            onChange={e => {
              if (fmt === "date") {
                const v = e.target.value;
                if (min && v && v < min) return;
                if (max && v && v > max) return;
              }
              setDraft(e.target.value);
            }}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") commit(); }}
            className={inputCls}
          />
        )}
        {fmt === "date" && (min || max) && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {min && max ? `${fmtDate(min)} – ${fmtDate(max)}` : min ? `From ${fmtDate(min)}` : `Until ${fmtDate(max!)}`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`${readOnly ? "" : "group cursor-pointer"} ${wrapCls}`} onClick={startEdit}>
      {labelEl}
      <div className="flex items-center gap-1.5">
        <p className={`font-semibold ${fullWidth ? "text-[11px] leading-relaxed" : "text-sm"} ${displayVal === "—" ? "text-slate-400 dark:text-slate-500 italic" : "text-slate-700 dark:text-slate-200"} ${!readOnly ? "group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:underline group-hover:decoration-dashed group-hover:underline-offset-2 group-hover:decoration-amber-400/60" : ""} transition-colors ${saving ? "opacity-50" : ""}`}>
          {displayVal}
        </p>
        {!readOnly && <Pencil size={12} className="text-amber-500 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
      </div>
    </div>
  );
}

// ─── NotesBox — always-visible textarea that saves on blur ────────────────────
function NotesBox({ value, onSave, readOnly }: { value: string | null; onSave: (v: string | null) => Promise<void>; readOnly?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  async function handleBlur() {
    const next = draft.trim() === "" ? null : draft.trim();
    const current = value?.trim() === "" ? null : value?.trim() ?? null;
    if (next === current) return;
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  }

  return (
    <div className="relative">
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleBlur(); } }}
        readOnly={readOnly}
        rows={3}
        placeholder={readOnly ? "—" : "Tulis notes..."}
        className={`w-full text-xs px-3 py-2 rounded-lg border resize-none outline-none transition-all leading-relaxed
          ${readOnly
            ? "bg-slate-50 dark:bg-white/2 border-slate-200/40 dark:border-white/6 text-slate-500 dark:text-slate-400 cursor-default placeholder:text-slate-300 dark:placeholder:text-slate-600"
            : "bg-white dark:bg-zinc-800/60 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
          } ${saving ? "opacity-50" : ""}`}
      />
      {saving && <Loader2 size={10} className="absolute top-2 right-2 animate-spin text-amber-400" />}
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

  const inputCls = "bg-white dark:bg-zinc-800 border border-amber-400 rounded px-2 py-0.5 outline-none ring-2 ring-amber-400/30 w-full " + (className ?? "");

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
      <span className={`${className} group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors`}>
        {value || <span className="italic text-slate-400">—</span>}
      </span>
      <Pencil size={10} className="text-slate-400 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </span>
  );
}

type FieldDef = {
  label: string;
  key: keyof ProjectDetail;
  format: "date" | "currency" | "text" | "weeks";
  fullWidth?: boolean;
  readonly?: boolean;
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
  phaseRowIdKey: keyof ProjectDetail;
};

const PHASE_DEFS: PhaseDef[] = [
  {
    key: "brief", phaseId: 1, phaseCode: "operational_brief",
    label: "Operational Brief", color: "#64748b", weight: 10,
    progressKey: "brief_progress",
    startKey: "brief_received", endKey: "brief_deadline",
    phaseRowIdKey: "brief_phase_row_id",
    fields: [
      { label: "Brief Received",  key: "brief_received",   format: "date" },
      { label: "Brief Deadline",  key: "brief_deadline",   format: "date" },
      { label: "Budget / CAPEX",  key: "budget_capex",     format: "currency", fullWidth: true },
      { label: "Brief Text",      key: "operational_brief",format: "text",     fullWidth: true },
      { label: "Notes",           key: "brief_notes",      format: "text",     fullWidth: true },
    ],
  },
  {
    key: "design", phaseId: 2, phaseCode: "design",
    label: "Design", color: "#3b82f6", weight: 20,
    progressKey: "design_progress",
    startKey: "design_start", endKey: "design_end",
    phaseRowIdKey: "design_phase_row_id",
    fields: [
      { label: "Start Design",             key: "design_start",            format: "date" },
      { label: "Approval Target (+1M)",    key: "design_approval_target",  format: "date" },
      { label: "Approval Real",            key: "design_end",              format: "date" },
      { label: "Duration (+/-)",           key: "design_duration_days",    format: "text" },
      { label: "Brief",                    key: "design_brief",            format: "text", fullWidth: true },
      { label: "Working Drawing (+3W)",    key: "working_drawing_status",  format: "text", fullWidth: true },
      { label: "Notes",                    key: "design_notes",            format: "text", fullWidth: true },
    ],
  },
  {
    key: "control", phaseId: 3, phaseCode: "project_control",
    label: "Project Control", color: "#f59e0b", weight: 15,
    progressKey: "control_progress",
    startKey: "control_start", endKey: "control_end",
    phaseRowIdKey: "control_phase_row_id",
    fields: [
      { label: "Tender Start",               key: "control_start",                  format: "date" },
      { label: "Tender Finish Target (+3W)", key: "aps_spk_target",                format: "date" },
      { label: "Tender Finish Real",         key: "control_end",                    format: "date" },
      { label: "Duration (+/-)",             key: "project_control_duration_days",  format: "text" },
      { label: "APS Date",                   key: "aps_date",                       format: "date" },
      { label: "Contract Amount",            key: "phase_contract_amount",          format: "currency", fullWidth: true },
      { label: "Notes",                      key: "control_notes",                  format: "text",     fullWidth: true },
    ],
  },
  {
    key: "pm", phaseId: 4, phaseCode: "project_management",
    label: "Project Management", color: "#14b8a6", weight: 45,
    progressKey: "pm_progress",
    startKey: "pm_start", endKey: "pm_end",
    phaseRowIdKey: "pm_phase_row_id",
    fields: [
      { label: "START",                  key: "pm_start",              format: "date" },
      { label: "END",                    key: "pm_end",                format: "date" },
      { label: "Completion Real Date",   key: "pm_actual_end",         format: "date" },
      { label: "Duration (weeks)",       key: "pm_duration_days",      format: "weeks", readonly: true },
      { label: "+/- Deviation Days",     key: "deviation_days",        format: "text" },
      { label: "Progress %",            key: "current_site_progress", format: "text" },
      { label: "Notes",                  key: "pm_notes",              format: "text", fullWidth: true },
    ],
  },
  {
    key: "handover", phaseId: 5, phaseCode: "handover",
    label: "Handover", color: "#22c55e", weight: 10,
    progressKey: "handover_progress",
    startKey: "handover_start", endKey: "handover_end",
    phaseRowIdKey: "handover_phase_row_id",
    fields: [
      { label: "BAST 1",          key: "handover_start",               format: "date" },
      { label: "BAST 2",          key: "handover_end",                 format: "date" },
      { label: "Completion Date", key: "actual_phase_completion_date", format: "date", fullWidth: true },
      { label: "Notes",           key: "handover_notes",               format: "text", fullWidth: true },
    ],
  },
];

// Shift a YYYY-MM-DD string by ±N days without UTC-offset distortion
function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Actual-completion keys are exempt — they record reality, not plans
const UNCONSTRAINED_KEYS = new Set<keyof ProjectDetail>(["pm_actual_end", "actual_phase_completion_date"]);

function dateFieldConstraint(
  key: keyof ProjectDetail,
  project: ProjectDetail,
): { min?: string; max?: string } {
  if (UNCONSTRAINED_KEYS.has(key)) return {};
  const d10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
  const projectStart = d10(project.start_date) || undefined;
  const projectEnd   = d10(project.end_date)   || undefined;
  if (key === "start_date") return { max: projectEnd };
  if (key === "end_date")   return { min: projectStart };
  const phaseDef = PHASE_DEFS.find(p => p.startKey === key || p.endKey === key);
  if (!phaseDef) return {};
  const phaseId = phaseDef.phaseId;
  const isStart = phaseDef.startKey === key;
  const allPhases = PHASE_DEFS.map(p => ({
    id:    p.phaseId,
    start: d10(project[p.startKey] as string | null),
    end:   d10(project[p.endKey]   as string | null),
  }));
  // Nearest preceding phase with end or start date (end preferred)
  const before = [...allPhases].filter(p => p.id < phaseId).reverse().find(p => p.end || p.start);
  // Nearest following phase with a start date
  const after  = allPhases.find(p => p.id > phaseId && p.start);
  // Phases must not share dates: use day-after for min, day-before for max
  const prevBound = before ? shiftDay(before.end || before.start, +1) : undefined;
  const nextBound = after  ? shiftDay(after.start, -1)                : undefined;
  if (isStart) {
    const thisEnd = d10(project[phaseDef.endKey] as string | null);
    return { min: prevBound || projectStart, max: thisEnd || nextBound || projectEnd };
  } else {
    const thisStart = d10(project[phaseDef.startKey] as string | null);
    return { min: thisStart || prevBound || projectStart, max: nextBound || projectEnd };
  }
}

function PhaseCard({
  ph, project, isCurrent, isPast, people, onSave,
  phaseRowId, tasks, attachments,
  onTaskAdd, onTaskToggle, onTaskDelete,
  onFileUpload, onFileDelete,
}: {
  ph: PhaseDef;
  project: ProjectDetail;
  isCurrent: boolean;
  isPast: boolean;
  people: PersonRow[];
  onSave: (key: keyof ProjectDetail, value: string | null) => Promise<void>;
  phaseRowId: string | null;
  tasks: TaskRow[];
  attachments: AttachmentRow[];
  onTaskAdd: (title: string, assigneeName?: string | null, assignedByName?: string | null) => Promise<void>;
  onTaskToggle: (taskId: string, done: boolean) => Promise<void>;
  onTaskDelete: (taskId: string) => Promise<void>;
  onFileUpload: (file: File) => Promise<void>;
  onFileDelete: (attachmentId: string) => Promise<void>;
}) {
  const isLocked    = !isCurrent;
  const phasePeople = people.filter(p => Number(p.phase_id) === ph.phaseId);

  const [open,             setOpen]             = useState(isCurrent);
  const [newTaskInput,      setNewTaskInput]      = useState("");
  const [newTaskAssignee,   setNewTaskAssignee]   = useState("");
  const [newTaskAssignedBy, setNewTaskAssignedBy] = useState("");
  const [addingTask,        setAddingTask]        = useState(false);
  const [showAddTask,       setShowAddTask]       = useState(false);
  const [uploadingFile,     setUploadingFile]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleTaskAdd() {
    if (!newTaskInput.trim()) return;
    setAddingTask(true);
    try {
      await onTaskAdd(newTaskInput.trim(), newTaskAssignee.trim() || null, newTaskAssignedBy.trim() || null);
      setNewTaskInput("");
      setNewTaskAssignee("");
      setNewTaskAssignedBy("");
      setShowAddTask(false);
    }
    finally { setAddingTask(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try { await onFileUpload(file); }
    finally { setUploadingFile(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  const inputCls = "flex-1 text-[10px] px-2 py-1 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all";
  const addBtnCls = "p-1 rounded-lg bg-slate-100 dark:bg-white/8 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/12 disabled:opacity-40 transition-colors shrink-0";

  return (
    <div
      className="relative rounded-lg border overflow-hidden transition-all"
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
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors"
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
          {isLocked && !isPast && (
            <span className="ml-2 text-[8px] font-semibold px-2 py-0.5 rounded-full align-middle text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/6 border border-slate-200/60 dark:border-white/8">
              NOT STARTED
            </span>
          )}
          {isPast && (
            <span className="ml-2 text-[8px] font-semibold px-2 py-0.5 rounded-full align-middle" style={{ color: ph.color, backgroundColor: `${ph.color}18` }}>
              DONE
            </span>
          )}
        </span>
        <ChevronDown size={13} className="shrink-0 transition-transform duration-200" style={{ color: `${ph.color}99`, transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
      <div style={{ overflow: "hidden" }}>
      <div className="px-4 py-3 bg-white/40 dark:bg-zinc-900/30 space-y-3">
        {/* ── Date/field grid ── */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {ph.fields.filter(f => f.label !== "Notes").map(f => {
            const c = f.format === "date" ? dateFieldConstraint(f.key, project) : {};
            return (
              <InlineField
                key={f.key as string}
                label={f.label}
                value={project[f.key] as string | null}
                format={f.format}
                fullWidth={f.fullWidth}
                readOnly={isLocked || !!f.readonly}
                min={c.min}
                max={c.max}
                onSave={v => onSave(f.key, v)}
              />
            );
          })}

        </div>

        {/* ── PIC ── */}
        {phasePeople.length > 0 && (
          <div className="pt-2 border-t border-slate-200/40 dark:border-white/6">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">PIC</p>
            <div className="flex flex-wrap gap-1.5">
              {phasePeople.map(p => {
                const name = p.full_name || p.raw_person_name || "—";
                return (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-white/10"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ph.color }} />
                    {name}
                    {p.job_title && <span className="text-slate-400 dark:text-slate-500 font-normal">· {p.job_title}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        {ph.fields.filter(f => f.label === "Notes").map(f => (
          <div key={f.key as string} className="pt-2 border-t border-slate-200/40 dark:border-white/6">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5">Notes</p>
            <NotesBox
              value={project[f.key] as string | null}
              readOnly={isLocked || !!f.readonly}
              onSave={v => onSave(f.key, v)}
            />
          </div>
        ))}

        {/* ── Weekly Progress button (PM phase only) ── */}
        {ph.key === "pm" && isCurrent && (
          <div className="pt-3 border-t border-slate-200/40 dark:border-white/6 flex justify-center">
            <a
              href={`/dashboard/projects/${project.id}/weekly-progress`}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-zinc-900/40 text-slate-600 dark:text-slate-300 hover:border-amber-400/60 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all text-xs font-semibold"
            >
              <Camera size={13} />
              Weekly Progress
            </a>
          </div>
        )}

        {/* ── Sub-Tasks (hidden for PM phase) ── */}
        {ph.key !== "pm" && (
        <div className="pt-3 border-t border-slate-200/40 dark:border-white/6">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Sub-Tasks</p>
            {!isLocked && phaseRowId && (
              <button
                onClick={() => { setNewTaskInput(""); setNewTaskAssignee(""); setNewTaskAssignedBy(""); setShowAddTask(true); }}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400 transition-colors"
              >
                <Plus size={11} /> Add
              </button>
            )}
          </div>
          {tasks.length > 0 && (
            <div className="space-y-1 mb-2">
              {tasks.map(t => {
                const done = Number(t.progress_pct) >= 100;
                return (
                  <div key={t.id} className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/4 transition-colors">
                    <button
                      onClick={() => !isLocked && onTaskToggle(t.id, !done)}
                      className={`shrink-0 transition-colors ${isLocked ? "cursor-default text-slate-300 dark:text-slate-600" : "text-slate-400 hover:text-amber-500"}`}
                    >
                      {done
                        ? <CheckSquare size={16} className={isLocked ? "text-slate-300 dark:text-slate-600" : "text-amber-500"} />
                        : <Square size={16} />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${done ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-200"}`}>
                        {t.title}
                      </p>
                      {(t.raw_assignee_name || t.raw_assigned_by_name) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {t.raw_assignee_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                              <User size={10} className="shrink-0" />
                              {t.raw_assignee_name}
                            </span>
                          )}
                          {t.raw_assigned_by_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-400">
                              <span className="text-[9px]">by</span>
                              {t.raw_assigned_by_name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!isLocked && (
                      <button
                        onClick={() => onTaskDelete(t.id)}
                        className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-slate-400 hover:text-rose-500 transition-all shrink-0"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tasks.length === 0 && (
            <p className="text-[10px] italic text-slate-400 dark:text-slate-500 mb-2">No sub-tasks</p>
          )}

          {showAddTask && typeof document !== "undefined" && createPortal(
            <div
              className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
              onMouseDown={e => { if (e.target === e.currentTarget) setShowAddTask(false); }}
            >
              <div
                className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 p-6 space-y-4 animate-modal-enter"
                style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Add Sub-Task</p>
                  <button onClick={() => setShowAddTask(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block">Nama Sub-Task <span className="text-red-400">*</span></label>
                    <input
                      autoFocus
                      value={newTaskInput}
                      onChange={e => setNewTaskInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newTaskInput.trim()) handleTaskAdd(); }}
                      placeholder="Tulis nama sub-task..."
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 outline-none focus:border-amber-600/60 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block">Assignee</label>
                      <input
                        value={newTaskAssignee}
                        onChange={e => setNewTaskAssignee(e.target.value)}
                        placeholder="Nama assignee..."
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 outline-none focus:border-amber-600/60 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5 block">Assigned By</label>
                      <input
                        value={newTaskAssignedBy}
                        onChange={e => setNewTaskAssignedBy(e.target.value)}
                        placeholder="Nama yang assign..."
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 outline-none focus:border-amber-600/60 transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => setShowAddTask(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTaskAdd}
                    disabled={addingTask || !newTaskInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: "#7c3d12" }}
                  >
                    {addingTask ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                    Add
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
        )} {/* end sub-tasks (non-PM only) */}

        {/* ── Documents (hidden for PM phase) ── */}
        {ph.key !== "pm" && (
        <div className="pt-3 border-t border-slate-200/40 dark:border-white/6">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-400">Documents</p>
            {!isLocked && phaseRowId && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400 disabled:opacity-40 transition-colors"
              >
                {uploadingFile ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Upload
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          {attachments.length > 0 ? (
            <div className="space-y-1">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-2 group rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors">
                  <FileText size={10} className="text-slate-400 shrink-0" />
                  <a
                    href={a.file_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-[10px] text-slate-600 dark:text-slate-300 truncate hover:text-amber-600 dark:hover:text-amber-400 hover:underline transition-colors"
                  >
                    {a.file_name}
                  </a>
                  {a.file_size_bytes && (
                    <span className="text-[9px] text-slate-400 shrink-0">{fmtBytes(a.file_size_bytes)}</span>
                  )}
                  {!isLocked && (
                    <button
                      onClick={() => onFileDelete(a.id)}
                      className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-slate-400 hover:text-rose-500 transition-all shrink-0"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] italic text-slate-400 dark:text-slate-500">No documents yet</p>
          )}
        </div>
        )} {/* end documents (non-PM only) */}
      </div>
      </div>
      </div>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  return (
    <Suspense>
      <ProjectDetailContent />
    </Suspense>
  );
}

function ProjectDetailContent() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const backTo = fromParam === "summary"
    ? "/dashboard/projects/summary-matrix"
    : fromParam === "completed"
    ? "/dashboard/projects/list?tab=completed"
    : "/dashboard/projects/gantt";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [people, setPeople]         = useState<PersonRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [tasks, setTasks]           = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
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
  const [masterPeople, setMasterPeople] = useState<{ id: number; full_name: string; job_title: string | null }[]>([]);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const [statusOptions, setStatusOptions] = useState<{ id: number; name: string; color: string }[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<{ id: number; code: string; name: string; color: string }[]>([]);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const [unitOptions, setUnitOptions] = useState<{ id: number; code: string; name: string }[]>([]);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const unitBtnRef = useRef<HTMLButtonElement>(null);
  const [phaseNoteModal, setPhaseNoteModal] = useState<{ nextPhase: typeof PHASE_DEFS[number]; needsDates: boolean } | null>(null);
  const [phaseNote, setPhaseNote]           = useState("");
  const [phaseStartDate, setPhaseStartDate] = useState("");
  const [phaseEndDate, setPhaseEndDate]     = useState("");

  const phaseModalConstraints = useMemo<{ dateMin?: string; dateMax?: string }>(() => {
    if (!phaseNoteModal?.needsDates || !project) return {};
    const d10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
    const nextPhaseId = phaseNoteModal.nextPhase.phaseId;
    const allPhases = PHASE_DEFS.map(p => ({
      id:    p.phaseId,
      start: d10(project[p.startKey] as string | null),
      end:   d10(project[p.endKey]   as string | null),
    }));
    const before = [...allPhases].filter(p => p.id < nextPhaseId).reverse().find(p => p.end || p.start);
    const after  = allPhases.find(p => p.id > nextPhaseId && p.start);
    const prevBound = before ? shiftDay(before.end || before.start, +1) : undefined;
    const nextBound = after  ? shiftDay(after.start, -1)                : undefined;
    return {
      dateMin: prevBound || d10(project.start_date) || undefined,
      dateMax: nextBound || d10(project.end_date)   || undefined,
    };
  }, [phaseNoteModal, project]);
  // Notes modal for priority/status changes
  const [changeReasonModal, setChangeReasonModal] = useState<{
    type: "status" | "priority";
    newId: number;
    newColor: string;
    newLabel: string;
    newCode?: string;
  } | null>(null);
  const [changeReason, setChangeReason] = useState("");

  useEffect(() => {
    fetch("/api/master/options")
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setStatusOptions(d.statuses ?? []);
          setPriorityOptions(d.priorities ?? []);
          setUnitOptions((d.units ?? []).map((u: { id: number; code: string; name: string }) => ({ id: u.id, code: u.code, name: u.name })));
        }
      })
      .catch(() => {});
    fetch("/api/master/people")
      .then(r => r.json())
      .then(d => { if (d.success) setMasterPeople(d.data); })
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
          setTasks(json.data.tasks ?? []);
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

  async function addStakeholder(nameOverride?: string) {
    const name = (nameOverride ?? newStakeholder).trim();
    if (!name) return;
    setAddingStakeholder(true);
    try {
      const res = await fetch(`/api/projects/${id}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_person_name: name, role_code: "stakeholder" }),
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

  async function handleTaskAdd(phaseRowId: string, title: string, assigneeName?: string | null, assignedByName?: string | null) {
    const res = await fetch(`/api/projects/${id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, phase_id: phaseRowId, raw_assignee_name: assigneeName ?? null, raw_assigned_by_name: assignedByName ?? null }),
    });
    const data = await res.json();
    if (data.success) {
      setTasks(prev => [...prev, {
        id: data.data.id,
        title: data.data.title,
        progress_pct: Number(data.data.progress_pct ?? 0),
        phase_id: phaseRowId,
        raw_assignee_name: data.data.raw_assignee_name ?? null,
        raw_assigned_by_name: data.data.raw_assigned_by_name ?? null,
      }]);
    }
  }

  async function handleTaskToggle(taskId: string, done: boolean) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress_pct: done ? 100 : 0 } : t));
    await fetch(`/api/projects/${id}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, progress_pct: done ? 100 : 0 }),
    });
  }

  async function handleTaskDelete(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await fetch(`/api/projects/${id}/tasks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
  }

  async function handleFileUpload(phaseRowId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("phase_id", phaseRowId);
    const res = await fetch(`/api/projects/${id}/attachments`, { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      setAttachments(prev => [{ ...data.data, phase_name: null }, ...prev]);
    }
  }

  async function handleFileDelete(attachmentId: string) {
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    await fetch(`/api/projects/${id}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
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
      <div className="flex justify-center py-20">
        <div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold text-red-400">{error ?? "Project not found"}</p>
        <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fromParam === "completed" ? router.back() : router.push(backTo)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/projects/${id}/audit`)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-zinc-900/80 transition-all text-xs font-semibold"
          >
            <Clock size={13} />
            View Audit Log
          </button>
          <button
            onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-200/70 dark:border-rose-500/20 bg-rose-50/80 dark:bg-rose-500/8 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 hover:border-rose-300 dark:hover:border-rose-500/40 transition-all text-xs font-semibold"
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
          <div className={`w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 p-6 space-y-4 ${exitingConfirm ? "animate-modal-exit" : "animate-modal-enter"}`} style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
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
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="fixed z-9998 bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5 min-w-32.5 animate-dropdown-enter"
            style={(() => {
              const r = statusBtnRef.current?.getBoundingClientRect();
              return r ? { top: r.bottom + 6, left: r.left } : { top: 0, left: 0 };
            })()}
          >
            {statusOptions.map(s => (
              <button
                key={s.id}
                onMouseDown={() => {
                  setShowStatusPicker(false);
                  if (s.name === project.status_label) return;
                  setChangeReason("");
                  setChangeReasonModal({ type: "status", newId: s.id, newColor: s.color, newLabel: s.name });
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

      {/* ── Priority picker ─────────────────────────────────────────────── */}
      {showPriorityPicker && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-9997" onMouseDown={() => setShowPriorityPicker(false)} />
          <div
            className="fixed z-9998 bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5 min-w-32 animate-dropdown-enter"
            style={(() => {
              const r = priorityBtnRef.current?.getBoundingClientRect();
              return r ? { top: r.bottom + 6, left: r.left } : { top: 0, left: 0 };
            })()}
          >
            {priorityOptions.map(p => (
              <button
                key={p.id}
                onMouseDown={() => {
                  setShowPriorityPicker(false);
                  if (p.code === project.priority_code) return;
                  setChangeReason("");
                  setChangeReasonModal({ type: "priority", newId: p.id, newColor: p.color, newLabel: p.name, newCode: p.code });
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/6 text-left w-full"
                style={{ color: p.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
                {p.code === project.priority_code && <span className="ml-auto text-[9px]">✓</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* ── Unit picker ──────────────────────────────────────────────────── */}
      {showUnitPicker && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-9997" onMouseDown={() => setShowUnitPicker(false)} />
          <div
            className="fixed z-9998 bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-white/10 rounded-lg shadow-xl p-1.5 flex flex-col gap-0.5 min-w-52 max-h-64 overflow-y-auto animate-dropdown-enter"
            style={(() => {
              const r = unitBtnRef.current?.getBoundingClientRect();
              return r ? { top: r.bottom + 6, left: r.left } : { top: 0, left: 0 };
            })()}
          >
            {unitOptions.map(u => (
              <button
                key={u.id}
                onMouseDown={async () => {
                  setShowUnitPicker(false);
                  setProject(prev => prev ? { ...prev, unit_name: u.name, unit_code: u.code } : prev);
                  await fetch(`/api/projects/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ field: "unit_id", value: String(u.id), change_summary: `Unit → ${u.name}`, action_type: "field_updated" }),
                  });
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/6 text-left w-full text-slate-700 dark:text-slate-200"
              >
                <span className="text-[10px] font-mono text-slate-400 w-10 shrink-0">{u.code}</span>
                {u.name}
                {u.name === project.unit_name && <span className="ml-auto text-[9px] text-brand-sienna">✓</span>}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* ── Change reason modal (status & priority) ─────────────────────── */}
      {changeReasonModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setChangeReasonModal(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 p-6 space-y-4 animate-modal-enter" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${changeReasonModal.newColor}20` }}>
                <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: changeReasonModal.newColor }} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  Change {changeReasonModal.type === "status" ? "Status" : "Priority"} to &quot;{changeReasonModal.newLabel}&quot;?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Please provide a reason for this change.
                </p>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">
                Reason / Notes <span className="text-red-400">*</span>
              </label>
              <textarea
                autoFocus
                value={changeReason}
                onChange={e => setChangeReason(e.target.value)}
                rows={3}
                placeholder={changeReasonModal.type === "status" ? "e.g. Project is now on hold due to budget review..." : "e.g. Escalated to Critical after stakeholder review..."}
                className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setChangeReasonModal(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!changeReason.trim()}
                onClick={async () => {
                  const modal = changeReasonModal;
                  setChangeReasonModal(null);
                  if (modal.type === "status") {
                    setProject(prev => prev ? { ...prev, status_label: modal.newLabel, status_color: modal.newColor } : prev);
                    await fetch(`/api/projects/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ field: "overall_status_id", value: String(modal.newId), change_summary: `Status → ${modal.newLabel}: ${changeReason.trim()}`, action_type: "field_updated" }),
                    });
                  } else {
                    setProject(prev => prev ? { ...prev, priority_name: modal.newLabel, priority_color: modal.newColor, priority_code: modal.newCode ?? null } : prev);
                    await fetch(`/api/projects/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ field: "priority_id", value: String(modal.newId), change_summary: `Priority → ${modal.newLabel}: ${changeReason.trim()}`, action_type: "field_updated" }),
                    });
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: changeReasonModal.newColor }}
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Phase advance note modal ────────────────────────────────── */}
      {phaseNoteModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-backdrop-enter"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setPhaseNoteModal(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/10 p-6 space-y-4 animate-modal-enter" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${phaseNoteModal.nextPhase.color}20` }}>
                <ChevronRight size={18} style={{ color: phaseNoteModal.nextPhase.color }} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  Proceed to {phaseNoteModal.nextPhase.label}?
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {phaseNoteModal.needsDates
                    ? "Set phase dates and add notes before continuing."
                    : "Add a reason before continuing to the next phase."}
                </p>
              </div>
            </div>

            {/* Date inputs — only when phase has no dates yet */}
            {phaseNoteModal.needsDates && (() => {
              const { dateMin, dateMax } = phaseModalConstraints;
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">
                      Start Date <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={phaseStartDate}
                      min={dateMin}
                      max={phaseEndDate || dateMax}
                      onChange={e => {
                        const v = e.target.value;
                        if (dateMin && v && v < dateMin) return;
                        if (v && (phaseEndDate || dateMax) && v > (phaseEndDate || dateMax)!) return;
                        setPhaseStartDate(v);
                      }}
                      className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/4 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 transition-all"
                    />
                    {dateMin && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">From {fmtDate(dateMin)}</p>}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">
                      End Date <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={phaseEndDate}
                      min={phaseStartDate || dateMin}
                      max={dateMax}
                      onChange={e => {
                        const v = e.target.value;
                        const lo = phaseStartDate || dateMin;
                        if (lo && v && v < lo) return;
                        if (dateMax && v && v > dateMax) return;
                        setPhaseEndDate(v);
                      }}
                      className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/4 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 transition-all"
                    />
                    {dateMax && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Until {fmtDate(dateMax)}</p>}
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 block">
                Note / Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                autoFocus={!phaseNoteModal.needsDates}
                value={phaseNote}
                onChange={e => setPhaseNote(e.target.value)}
                rows={3}
                placeholder="e.g. Design approved by stakeholders, ready to proceed..."
                className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
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
                disabled={!phaseNote.trim() || (phaseNoteModal.needsDates && (!phaseStartDate || !phaseEndDate))}
                onClick={async () => {
                  const { nextPhase, needsDates } = phaseNoteModal;
                  setPhaseNoteModal(null);
                  setProject(prev => prev ? {
                    ...prev,
                    current_phase_code: nextPhase.phaseCode,
                    current_phase_name: nextPhase.label,
                    ...(needsDates ? {
                      [nextPhase.startKey]: phaseStartDate,
                      [nextPhase.endKey]:   phaseEndDate,
                    } : {}),
                  } : prev);
                  // Save dates first if they were missing
                  if (needsDates) {
                    await Promise.all([
                      fetch(`/api/projects/${id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ field: nextPhase.startKey, value: phaseStartDate, action_type: "field_updated" }),
                      }),
                      fetch(`/api/projects/${id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ field: nextPhase.endKey, value: phaseEndDate, action_type: "field_updated" }),
                      }),
                    ]);
                  }
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
          <FileText size={14} className="text-amber-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Project Description</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200/50 dark:divide-white/8">

          {/* ── Left ── */}
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Project Name</p>
              <InlineText
                value={project.project_name}
                onSave={v => patchField("project_name", v)}
                className="text-base font-bold text-slate-700 dark:text-slate-200 leading-snug"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Project ID</p>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded inline-block">
                {project.project_code}
              </p>
            </div>
            <div className="flex items-start gap-4 flex-wrap">
              <div onClick={e => e.stopPropagation()}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Priority</p>
                <button
                  ref={priorityBtnRef}
                  onClick={e => { e.stopPropagation(); setShowPriorityPicker(v => !v); }}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md transition-all ${!project.priority_color ? "bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10" : ""}`}
                  style={project.priority_color
                    ? { backgroundColor: `${project.priority_color}20`, color: project.priority_color, border: `1.5px solid ${project.priority_color}60` }
                    : undefined
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.priority_color ?? "#94a3b8" }} />
                  {project.priority_name ?? "Set priority"}
                  <ChevronDown size={10} />
                </button>
              </div>
              <div onClick={e => e.stopPropagation()}>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Status</p>
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
              <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Summary</p>
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
            {/* Project period */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Clock size={11} className="text-slate-400 dark:text-slate-500" />
                Project Period
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200/60 dark:border-white/8 bg-slate-50/60 dark:bg-white/2 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Start Date</p>
                  <InlineField
                    label=""
                    value={project.start_date}
                    format="date"
                    max={dateFieldConstraint("start_date", project).max}
                    onSave={v => patchField("start_date", v)}
                  />
                </div>
                <div className="rounded-lg border border-slate-200/60 dark:border-white/8 bg-slate-50/60 dark:bg-white/2 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">End Date</p>
                  <InlineField
                    label=""
                    value={project.end_date}
                    format="date"
                    min={dateFieldConstraint("end_date", project).min}
                    onSave={v => patchField("end_date", v)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                  <Building2 size={11} className="text-slate-400 dark:text-slate-500" />
                  Location
                </p>
                <button
                  ref={unitBtnRef}
                  onClick={e => { e.stopPropagation(); setShowUnitPicker(v => !v); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200/70 dark:border-white/8 bg-white/60 dark:bg-white/3 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/6 transition-all text-left group"
                >
                  {project.unit_name || project.unit_code ? (
                    <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {project.unit_name ?? project.unit_code}
                      {project.unit_name && project.unit_code && (
                        <span className="ml-1 font-medium text-slate-400 dark:text-slate-500">({project.unit_code})</span>
                      )}
                    </span>
                  ) : (
                    <span className="flex-1 text-xs italic text-slate-400 dark:text-slate-500">Unit not specified</span>
                  )}
                  <ChevronDown size={11} className="text-slate-400 dark:text-slate-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                  <MapPin size={11} className="text-slate-400 dark:text-slate-500" />
                  Address
                </p>
                <textarea
                  rows={2}
                  defaultValue={project.address ?? ""}
                  onBlur={e => { const v = e.target.value.trim() || null; if (v !== (project.address ?? null)) patchField("address", v); }}
                  placeholder="Add address..."
                  className="w-full resize-none text-xs bg-transparent text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none border-none py-0.5 leading-relaxed"
                />
              </div>
            </div>

            {/* Stakeholders */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                <Users size={11} className="text-slate-400 dark:text-slate-500" />
                Stakeholders
              </p>
              <div className="space-y-2">
                {people.some(p => p.role_code === "stakeholder") ? (
                  <div className="flex flex-wrap gap-1.5">
                    {people.filter(p => p.role_code === "stakeholder").map(s => (
                      <span key={s.id} className="group inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/6 px-2 py-1 rounded-md">
                        <Building2 size={10} className="text-slate-400 dark:text-slate-500 shrink-0" />
                        {s.full_name ?? s.raw_person_name ?? s.raw_organization_name ?? "—"}
                        <button onClick={() => removeStakeholder(s.id)} className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] italic text-slate-400 dark:text-slate-500">No stakeholders yet</p>
                )}
                {/* Add stakeholder inline */}
                <div className="flex items-center gap-1.5">
                  <AnimatedDropdown
                    value=""
                    placeholder={addingStakeholder ? "Adding…" : "Add stakeholder…"}
                    disabled={addingStakeholder}
                    options={masterPeople
                      .filter(mp => !people.some(p => p.role_code === "stakeholder" && (p.full_name === mp.full_name || p.raw_person_name === mp.full_name)))
                      .map(mp => ({ value: mp.full_name, label: mp.full_name }))
                    }
                    onChange={v => { if (v) addStakeholder(v); }}
                    minWidth={180}
                    dropUp
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Phase Parameters ─────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
          <Activity size={14} className="text-amber-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Phase Parameters</h3>
          {(() => {
            const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
            const nextPhase  = currentIdx === -1
              ? PHASE_DEFS[0]
              : currentIdx < PHASE_DEFS.length - 1 ? PHASE_DEFS[currentIdx + 1] : null;
            if (!nextPhase) return null;
            return (
              <button
                onClick={() => {
                  const startVal = project[nextPhase.startKey as keyof typeof project] as string | null | undefined;
                  const endVal   = project[nextPhase.endKey   as keyof typeof project] as string | null | undefined;
                  const needsDates = !startVal || !endVal;
                  setPhaseNote("");
                  setPhaseStartDate(startVal ? String(startVal).split("T")[0] : "");
                  setPhaseEndDate(endVal   ? String(endVal).split("T")[0]   : "");
                  setPhaseNoteModal({ nextPhase, needsDates });
                }}
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
                    className="relative flex-1 flex flex-col items-center justify-center px-2 py-2.5 rounded-lg text-center transition-all"
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
            const currentIdx  = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
            const phIdx       = PHASE_DEFS.findIndex(p => p.key === ph.key);
            const phaseRowId  = project[ph.phaseRowIdKey] as string | null;
            return (
              <PhaseCard
                key={ph.key}
                ph={ph}
                project={project}
                isCurrent={project.current_phase_code === ph.phaseCode}
                isPast={phIdx < currentIdx}
                people={people}
                onSave={patchField}
                phaseRowId={phaseRowId}
                tasks={tasks.filter(t => t.phase_id === phaseRowId)}
                attachments={attachments.filter(a => a.phase_id === phaseRowId)}
                onTaskAdd={(title, assigneeName, assignedByName) => handleTaskAdd(phaseRowId!, title, assigneeName, assignedByName)}
                onTaskToggle={handleTaskToggle}
                onTaskDelete={handleTaskDelete}
                onFileUpload={file => handleFileUpload(phaseRowId!, file)}
                onFileDelete={handleFileDelete}
              />
            );
          })}
        </div>
      </div>

      {/* ── S-Curve ────────────────────────────────────────────────────── */}
      {showImportModal && (
        <ScurveImportModal
          projectId={project.id}
          baseYear={project.pm_start ? new Date(project.pm_start).getFullYear() : new Date().getFullYear()}
          onImported={() => { window.location.reload(); }}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {project.current_phase_code === "project_management" && scProject ? (
        <div>
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 hover:border-green-500/40 transition-all"
            >
              <Upload size={12} />
              Import Excel
            </button>
          </div>
          <SCurveCharts projects={[scProject]} />
        </div>
      ) : (
        <div className="glass-card p-8 flex flex-col items-center justify-center gap-3 text-center min-h-40 border-dashed opacity-60">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 4 10" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">S-Curve</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Available when project reaches <span className="font-medium text-teal-500">Project Management</span> phase
            </p>
          </div>
        </div>
      )}


    </div>
  );
}
